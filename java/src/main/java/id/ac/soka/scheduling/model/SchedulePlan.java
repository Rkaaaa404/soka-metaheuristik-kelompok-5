package id.ac.soka.scheduling.model;

import java.util.Arrays;

/**
 * Immutable schedule plan produced by an algorithm.
 * taskOrder: priority permutation of task IDs.
 * assignedVm: assignedVm[taskId] is the target VM id.
 * capacityFactors: capacityFactors[vmId] is 0.0, 0.5, or 1.0.
 */
public record SchedulePlan(int[] taskOrder, int[] assignedVm, double[] capacityFactors) {
    public SchedulePlan {
        if (taskOrder == null || assignedVm == null || capacityFactors == null) {
            throw new IllegalArgumentException("SchedulePlan arrays must not be null");
        }
        taskOrder = taskOrder.clone();
        assignedVm = assignedVm.clone();
        capacityFactors = capacityFactors.clone();
    }

    @Override
    public int[] taskOrder() {
        return taskOrder.clone();
    }

    @Override
    public int[] assignedVm() {
        return assignedVm.clone();
    }

    @Override
    public double[] capacityFactors() {
        return capacityFactors.clone();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SchedulePlan that)) return false;
        return Arrays.equals(taskOrder, that.taskOrder) &&
               Arrays.equals(assignedVm, that.assignedVm) &&
               Arrays.equals(capacityFactors, that.capacityFactors);
    }

    @Override
    public int hashCode() {
        int result = Arrays.hashCode(taskOrder);
        result = 31 * result + Arrays.hashCode(assignedVm);
        result = 31 * result + Arrays.hashCode(capacityFactors);
        return result;
    }
}
