package id.ac.soka.scheduling.algorithm;

import id.ac.soka.scheduling.model.AlgorithmOptions;
import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.Scheduler;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;
import id.ac.soka.scheduling.simulation.DecodedSchedule;
import id.ac.soka.scheduling.simulation.ScheduleDecoder;
import id.ac.soka.scheduling.util.Mulberry32;

import java.util.*;

/**
 * CSA (Clonal Selection Algorithm) - Jena TSCSA Adaptation.
 */
public class CsaScheduler implements Scheduler {
    private final int totalHosts;

    public CsaScheduler(int totalHosts) {
        this.totalHosts = totalHosts;
    }

    public static class Candidate {
        public final int id;
        public final int[] assignedVm;
        public double makespan;
        public double energy;
        public double fitness; // Scalar F

        public Candidate(int id, int[] assignedVm) {
            this.id = id;
            this.assignedVm = assignedVm;
        }

        public void evaluate(
            List<TaskSpec> tasks,
            List<VmSpec> vms,
            int[] taskOrder,
            double[] capacityFactors,
            int totalHosts,
            double tRef,
            double eRef,
            double w
        ) {
            SchedulePlan plan = new SchedulePlan(taskOrder, assignedVm, capacityFactors);
            DecodedSchedule decoded = ScheduleDecoder.decode(tasks, vms, plan, totalHosts);
            this.makespan = decoded.makespan();
            this.energy = decoded.energyJoules();
            this.fitness = (w * (this.makespan / tRef)) + ((1.0 - w) * (this.energy / eRef));
        }
    }

    public static class ParetoArchive {
        private final List<Candidate> members = new ArrayList<>();

        public synchronized void update(Candidate c) {
            // Check if dominated by existing member
            for (Candidate m : members) {
                if (dominates(m, c)) {
                    return;
                }
                if (m.makespan == c.makespan && m.energy == c.energy) {
                    // Exact same objective values: keep one with smaller candidate ID
                    if (m.id <= c.id) {
                        return;
                    }
                }
            }

            // Remove any members dominated by c (or with same obj and larger id)
            members.removeIf(m -> dominates(c, m) || (m.makespan == c.makespan && m.energy == c.energy && c.id < m.id));
            members.add(c);
        }

        private static boolean dominates(Candidate a, Candidate b) {
            return (a.makespan <= b.makespan && a.energy <= b.energy) &&
                   (a.makespan < b.makespan || a.energy < b.energy);
        }

        public List<Candidate> getMembers() {
            return Collections.unmodifiableList(members);
        }

        public Candidate getBestByFitness() {
            Candidate best = null;
            for (Candidate m : members) {
                if (best == null || m.fitness < best.fitness || (m.fitness == best.fitness && m.id < best.id)) {
                    best = m;
                }
            }
            return best;
        }
    }

    @Override
    public SchedulePlan schedule(List<TaskSpec> tasks, List<VmSpec> vms, AlgorithmOptions options, long seed) {
        int n = tasks.size();
        int m = vms.size();

        AlgorithmOptions.CsaOptions csaOpt = (options != null && options.csa() != null)
            ? options.csa()
            : AlgorithmOptions.CsaOptions.defaults();

        int p = csaOpt.population();
        int k = csaOpt.selected();
        int g = csaOpt.generations();
        double beta = csaOpt.beta();
        double w = csaOpt.timeWeight();

        Mulberry32 rng = new Mulberry32(seed);

        // Fixed priority order: (arrival, id)
        List<TaskSpec> sortedTasks = new ArrayList<>(tasks);
        sortedTasks.sort(Comparator.comparingDouble(TaskSpec::arrivalTime).thenComparingInt(TaskSpec::id));
        int[] taskOrder = new int[n];
        for (int i = 0; i < n; i++) {
            taskOrder[i] = sortedTasks.get(i).id();
        }

        double[] capacityFactors = new double[m];
        Arrays.fill(capacityFactors, 1.0);

        // 1. Reference run using Round Robin
        SchedulePlan rrPlan = BaselineSchedulers.RR.schedule(tasks, vms, options, seed);
        DecodedSchedule rrDecoded = ScheduleDecoder.decode(tasks, vms, rrPlan, totalHosts);
        double tRef = Math.max(1e-9, rrDecoded.makespan());
        double eRef = Math.max(1e-9, rrDecoded.energyJoules());

        ParetoArchive archive = new ParetoArchive();
        int candidateSeq = 0;

        // 2. Initial population
        List<Candidate> population = new ArrayList<>(p);
        for (int i = 0; i < p; i++) {
            int[] vmGenes = new int[n];
            for (int j = 0; j < n; j++) {
                vmGenes[j] = rng.nextInt(m);
            }
            Candidate c = new Candidate(candidateSeq++, vmGenes);
            c.evaluate(tasks, vms, taskOrder, capacityFactors, totalHosts, tRef, eRef, w);
            population.add(c);
            archive.update(c);
        }

        // 3. Generation loop
        double pMin = 1.0 / n;
        double pMax = Math.min(1.0, 5.0 / n);

        for (int gen = 0; gen < g; gen++) {
            // Sort population by F ascending, tie id
            population.sort(Comparator.comparingDouble((Candidate c) -> c.fitness).thenComparingInt(c -> c.id));

            List<Candidate> parents = population.subList(0, k);
            List<Candidate> pool = new ArrayList<>(population);

            for (int r = 1; r <= k; r++) {
                Candidate parent = parents.get(r - 1);
                int numClones = Math.max(1, (int) Math.floor(beta * p / r));
                double p_r = (k > 1) ? pMin + ((pMax - pMin) * (r - 1) / (k - 1)) : pMin;

                for (int cIdx = 0; cIdx < numClones; cIdx++) {
                    int[] cloneGenes = parent.assignedVm.clone();
                    if (m > 1) {
                        for (int j = 0; j < n; j++) {
                            if (rng.nextDouble() < p_r) {
                                int oldVm = cloneGenes[j];
                                int pick = rng.nextInt(m - 1);
                                if (pick >= oldVm) pick++;
                                cloneGenes[j] = pick;
                            }
                        }
                    }
                    Candidate clone = new Candidate(candidateSeq++, cloneGenes);
                    clone.evaluate(tasks, vms, taskOrder, capacityFactors, totalHosts, tRef, eRef, w);
                    pool.add(clone);
                    archive.update(clone);
                }
            }

            // Survivor selection: best P from pool
            pool.sort(Comparator.comparingDouble((Candidate c) -> c.fitness).thenComparingInt(c -> c.id));
            population = new ArrayList<>(pool.subList(0, p));
        }

        Candidate best = archive.getBestByFitness();
        if (best == null) {
            best = population.get(0);
        }

        return new SchedulePlan(taskOrder, best.assignedVm, capacityFactors);
    }
}
