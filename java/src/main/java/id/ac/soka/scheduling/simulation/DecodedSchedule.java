package id.ac.soka.scheduling.simulation;

public record DecodedSchedule(
    double[] startTimes,
    double[] finishTimes,
    int[] assignedPe,
    double makespan,
    double energyJoules
) {}
