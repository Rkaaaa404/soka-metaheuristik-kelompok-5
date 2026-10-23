package id.ac.soka.scheduling.simulation;

import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.TaskAllocation;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;
import org.cloudbus.cloudsim.*;
import org.cloudbus.cloudsim.core.CloudSim;
import org.cloudbus.cloudsim.provisioners.BwProvisionerSimple;
import org.cloudbus.cloudsim.provisioners.PeProvisionerSimple;
import org.cloudbus.cloudsim.provisioners.RamProvisionerSimple;

import java.util.*;

public class CloudSimRunner {

    public static synchronized SimulationRunResult runSimulation(
        List<TaskSpec> tasks,
        List<VmSpec> vms,
        SchedulePlan plan,
        ScenarioConfig config
    ) {
        Log.disable();

        // 1. Reset CloudSim global state
        Calendar cal = Calendar.getInstance();
        cal.set(2026, Calendar.JANUARY, 1, 0, 0, 0);
        CloudSim.init(1, cal, false);

        try {
            // Map VM ID -> host index
            Map<Integer, Integer> vmToHostIndex = new HashMap<>();
            for (VmSpec vm : vms) {
                vmToHostIndex.put(vm.id(), vm.hostIndex());
            }

            // 2. Create Datacenters
            List<Integer> datacenterEntityIds = new ArrayList<>();
            for (int dc = 0; dc < config.datacenters(); dc++) {
                List<Host> hostList = new ArrayList<>(config.hostsPerDatacenter());
                for (int h = 0; h < config.hostsPerDatacenter(); h++) {
                    List<Pe> peList = new ArrayList<>(ScenarioFactory.HOST_PES);
                    for (int p = 0; p < ScenarioFactory.HOST_PES; p++) {
                        peList.add(new Pe(p, new PeProvisionerSimple(ScenarioFactory.HOST_PE_MIPS)));
                    }
                    Host host = new Host(
                        h,
                        new RamProvisionerSimple(ScenarioFactory.HOST_RAM_MB),
                        new BwProvisionerSimple(ScenarioFactory.HOST_BW_MBPS),
                        ScenarioFactory.HOST_STORAGE_MB,
                        peList,
                        new VmSchedulerTimeShared(peList)
                    );
                    hostList.add(host);
                }

                DatacenterCharacteristics characteristics = new DatacenterCharacteristics(
                    "x86", "Linux", "Xen", hostList,
                    10.0,
                    MetricsCalculator.COST_PER_SEC,
                    0.0, 0.0, 0.0
                );

                Datacenter datacenter = new Datacenter(
                    "Datacenter_" + dc,
                    characteristics,
                    new ExplicitVmAllocationPolicy(hostList, vmToHostIndex),
                    new LinkedList<>(),
                    0.0
                );
                datacenterEntityIds.add(datacenter.getId());
            }

            // 3. Create ArrivalBroker
            ArrivalBroker broker = new ArrivalBroker(
                "ArrivalBroker_" + System.nanoTime(),
                tasks,
                vms,
                plan,
                datacenterEntityIds
            );

            // 4. Create VMs
            List<Vm> cloudsimVmList = new ArrayList<>(vms.size());
            for (VmSpec spec : vms) {
                double factor = plan.capacityFactors()[spec.id()];
                double mips = (factor > 0.0) ? (spec.nominalMips() * factor) : spec.nominalMips();
                Vm vm = new Vm(
                    spec.id(),
                    broker.getId(),
                    mips,
                    spec.pes(),
                    spec.ramMb(),
                    spec.bandwidth(),
                    spec.storageMb(),
                    "Xen",
                    new CloudletSchedulerSpaceShared()
                );
                cloudsimVmList.add(vm);
            }
            broker.submitGuestList(cloudsimVmList);

            // 5. Run simulation
            CloudSim.startSimulation();
            List<Cloudlet> completed = broker.getCompletedCloudlets();
            CloudSim.stopSimulation();

            if (!broker.isCompleted() || completed.size() != tasks.size()) {
                throw new IllegalStateException(
                    "Simulation failed: expected " + tasks.size() + " completed cloudlets, got " + completed.size()
                );
            }

            // 6. Extract task allocations
            double epoch = broker.getWorkloadEpoch();
            List<TaskAllocation> allocations = new ArrayList<>(tasks.size());

            for (Cloudlet cloudlet : completed) {
                int taskId = cloudlet.getCloudletId();
                TaskSpec task = tasks.get(taskId);
                int vmId = cloudlet.getGuestId();
                VmSpec vm = vms.get(vmId);

                double start = cloudlet.getExecStartTime() - epoch;
                double finish = cloudlet.getExecFinishTime() - epoch;
                double cpuTime = cloudlet.getActualCPUTime();

                allocations.add(new TaskAllocation(
                    taskId,
                    vmId,
                    vm.datacenterIndex(),
                    vm.hostIndex(),
                    task.arrivalTime(),
                    start,
                    finish,
                    cpuTime,
                    task.sla()
                ));
            }

            allocations.sort(Comparator.comparingInt(TaskAllocation::taskId));

            return new SimulationRunResult(allocations, epoch);
        } catch (Exception e) {
            throw new RuntimeException("CloudSim execution failed: " + e.getMessage(), e);
        }
    }
}
