"""Export real CloudSim results from a running backend into static JSON for GitHub Pages.

Usage (backend must be running, e.g. `cd java && ./gradlew run`):
    python scripts/export_snapshots.py [--base http://localhost:8080] [--sizes 1000,5000,10000] [--runs 5]

Each snapshot keeps the exact API response shape (scenario, provenance, results[].metrics),
plus a compact per-VM summary of the representative run. Full task allocations are kept only
for the smallest scenario (they are used by the case-study Gantt), to keep the site light.
"""
import argparse
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data" / "results"


def call(base, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def vm_summary(rep):
    vms = {}
    for a in rep["allocations"]:
        v = vms.setdefault(a["vmId"], {"vmId": a["vmId"], "datacenterIndex": a["datacenterIndex"],
                                       "hostIndex": a["hostIndex"], "tasks": 0, "busy": 0.0, "lastFinish": 0.0})
        v["tasks"] += 1
        v["busy"] += a["cpuTime"]
        v["lastFinish"] = max(v["lastFinish"], a["finish"])
    return [vms[k] for k in sorted(vms)]


def compact(result, keep_allocations):
    for r in result["results"]:
        rep = r["representativeRun"]
        rep["vmSummary"] = vm_summary(rep)
        if not keep_allocations:
            rep["allocations"] = []
        r.pop("runMetrics", None)
    result.pop("exports", None)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080")
    ap.add_argument("--sizes", default="1000,5000,10000")
    ap.add_argument("--runs", type=int, default=5)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = [int(s) for s in args.sizes.split(",")]
    index = []
    for n in sizes:
        scenario = {
            "dataset": f"GoCJ_Dataset_{n}.csv", "taskCount": n,
            "algorithms": ["CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin"],
            "datacenters": 2, "hostsPerDatacenter": 5, "vmsPerDatacenter": 25,
            "vmDistribution": {"small": 2, "medium": 2, "large": 1},
            "runs": args.runs, "seed": 42,
            "csa": {"population": 30, "selected": 10, "generations": 200, "beta": 1.0, "timeWeight": 0.5},
            "phs": {"memorySize": 10, "iterations": 200, "improvisations": 3},
        }
        job_id = call(args.base, "/api/simulate", scenario)["jobId"]
        started = time.time()
        while True:
            job = call(args.base, f"/api/simulations/{job_id}")
            print(f"\r{n} task: {job['completedRuns']}/{job['totalRuns']} {job.get('currentAlgorithm', '')}      ", end="", flush=True)
            if job["status"] != "RUNNING":
                break
            time.sleep(2)
        print()
        if job["status"] != "SUCCEEDED":
            raise SystemExit(f"{n}: {job['status']} {job.get('error')}")
        result = compact(job["result"], keep_allocations=(n == min(sizes)))
        name = f"gocj-{n}.json"
        (OUT / name).write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
        index.append({"file": name, "taskCount": n, "runs": args.runs,
                      "timestampUtc": result["provenance"]["timestampUtc"],
                      "wallSeconds": round(time.time() - started)})
        (OUT / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
        print(f"saved {name}")


if __name__ == "__main__":
    main()
