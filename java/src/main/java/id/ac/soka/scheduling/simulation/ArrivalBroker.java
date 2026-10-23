package id.ac.soka.scheduling.simulation;

import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;
import org.cloudbus.cloudsim.Cloudlet;
import org.cloudbus.cloudsim.DatacenterBroker;
import org.cloudbus.cloudsim.UtilizationModelFull;
import org.cloudbus.cloudsim.core.CloudActionTags;
import org.cloudbus.cloudsim.core.CloudSim;
import org.cloudbus.cloudsim.core.GuestEntity;
import org.cloudbus.cloudsim.core.SimEvent;

import java.util.*;

public class ArrivalBroker extends DatacenterBroker {
    private final List<TaskSpec> tasks;
    private final List<VmSpec> vms;
    private final SchedulePlan plan;
    private final List<Integer> datacenterEntityIds;
    private final int expectedTaskCount;

    private final int[] runningTasksOnVm;
    private final int[] vmPes;
    private final PriorityQueue<TaskSpec>[] readyQueues;
    private final List<Cloudlet> completedCloudlets = new ArrayList<>();

    private double workloadEpoch = 0.0;
    private boolean completed = false;

    @SuppressWarnings("unchecked")
    public ArrivalBroker(
        String name,
        List<TaskSpec> tasks,
        List<VmSpec> vms,
        SchedulePlan plan,
        List<Integer> datacenterEntityIds
    ) throws Exception {
        super(name);
        this.tasks = tasks;
        this.vms = vms;
        this.plan = plan;
        this.datacenterEntityIds = datacenterEntityIds;
        this.expectedTaskCount = tasks.size();

        int m = vms.size();
        this.runningTasksOnVm = new int[m];
        this.vmPes = new int[m];
        this.readyQueues = new PriorityQueue[m];

        int[] taskOrder = plan.taskOrder();
        int[] priorityRank = new int[tasks.size()];
        for (int i = 0; i < taskOrder.length; i++) {
            priorityRank[taskOrder[i]] = i;
        }

        for (int v = 0; v < m; v++) {
            vmPes[v] = vms.get(v).pes();
            readyQueues[v] = new PriorityQueue<>(Comparator.comparingInt(t -> priorityRank[t.id()]));
        }
    }

    @Override
    protected void createVmsInDatacenter(int initialDcId) {
        int requested = 0;
        for (GuestEntity guest : getGuestList()) {
            int vmId = guest.getId();
            VmSpec spec = vms.get(vmId);
            int targetDcEntityId = datacenterEntityIds.get(spec.datacenterIndex());
            sendNow(targetDcEntityId, CloudActionTags.VM_CREATE_ACK, guest);
            requested++;
        }
        for (int dcEntityId : datacenterEntityIds) {
            getDatacenterRequestedIdsList().add(dcEntityId);
        }
        setVmsRequested(requested);
    }

    @Override
    protected void submitCloudlets() {
        if (getGuestsCreatedList().size() != getGuestList().size()) {
            throw new IllegalStateException(
                "VM creation failed: " + getGuestsCreatedList().size() + " created of " +
                getGuestList().size() + " requested"
            );
        }

        this.workloadEpoch = CloudSim.clock();

        // Schedule task arrivals relative to epoch
        for (TaskSpec task : tasks) {
            send(getId(), task.arrivalTime(), CustomTags.TASK_ARRIVAL, task);
        }
    }

    @Override
    protected void processOtherEvent(SimEvent ev) {
        if (ev != null && ev.getTag() == CustomTags.TASK_ARRIVAL) {
            TaskSpec task = (TaskSpec) ev.getData();
            int v = plan.assignedVm()[task.id()];
            if (runningTasksOnVm[v] < vmPes[v]) {
                dispatchTask(task, v);
            } else {
                readyQueues[v].add(task);
            }
        } else {
            super.processOtherEvent(ev);
        }
    }

    private void dispatchTask(TaskSpec task, int vmId) {
        Cloudlet cloudlet = new Cloudlet(
            task.id(),
            task.lengthMi(),
            1,
            1,
            1,
            new UtilizationModelFull(),
            new UtilizationModelFull(),
            new UtilizationModelFull()
        );
        cloudlet.setUserId(getId());
        cloudlet.setGuestId(vmId);
        runningTasksOnVm[vmId]++;

        Integer dcEntityId = getVmsToDatacentersMap().get(vmId);
        if (dcEntityId == null) {
            throw new IllegalStateException("Datacenter mapping missing for VM " + vmId);
        }
        sendNow(dcEntityId, CloudActionTags.CLOUDLET_SUBMIT, cloudlet);
        cloudletsSubmitted++;
        getCloudletSubmittedList().add(cloudlet);
    }

    @Override
    protected void processCloudletReturn(SimEvent ev) {
        Cloudlet cloudlet = (Cloudlet) ev.getData();
        getCloudletReceivedList().add(cloudlet);
        completedCloudlets.add(cloudlet);

        int vmId = cloudlet.getGuestId();
        runningTasksOnVm[vmId]--;

        // If there are ready tasks waiting for this VM, dispatch the next highest priority
        if (!readyQueues[vmId].isEmpty()) {
            TaskSpec nextTask = readyQueues[vmId].poll();
            dispatchTask(nextTask, vmId);
        }

        if (getCloudletReceivedList().size() == expectedTaskCount) {
            completed = true;
            clearDatacenters();
            finishExecution();
        }
    }

    public double getWorkloadEpoch() {
        return workloadEpoch;
    }

    public List<Cloudlet> getCompletedCloudlets() {
        return Collections.unmodifiableList(completedCloudlets);
    }

    public boolean isCompleted() {
        return completed;
    }
}
