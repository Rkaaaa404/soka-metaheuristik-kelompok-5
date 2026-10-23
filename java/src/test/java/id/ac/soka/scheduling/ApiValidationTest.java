package id.ac.soka.scheduling;

import id.ac.soka.scheduling.data.GoCjRepository;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.simulation.InsufficientCapacityException;
import id.ac.soka.scheduling.simulation.ScenarioConfig;
import id.ac.soka.scheduling.simulation.ScenarioFactory;
import id.ac.soka.scheduling.simulation.VmDistribution;
import id.ac.soka.scheduling.util.Mulberry32;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class ApiValidationTest {

    @Test
    public void testTaskSpecRejectsInvalidSla() {
        assertThrows(IllegalArgumentException.class, () -> new TaskSpec(0, 1000, 4, 0.0));
        assertThrows(IllegalArgumentException.class, () -> new TaskSpec(0, 1000, 0, 0.0));
    }

    @Test
    public void testRepositoryRejectsNonWhitelisted() {
        GoCjRepository repo = new GoCjRepository();
        assertThrows(IllegalArgumentException.class, () -> repo.loadTasks("hacked.csv", 10));
    }

    @Test
    public void testScenarioValidationRejectsMismatchedVmDistribution() {
        assertThrows(IllegalArgumentException.class, () ->
            new ScenarioConfig("GoCJ_Dataset_1000.csv", List.of("FCFS"), 100, 2, 5, 5, new VmDistribution(2, 2, 2), 1, 42L, null, null)
        );
    }

    @Test
    public void testInsufficientCapacityRejection() {
        // Datacenter with 1 host (16 PEs total), but 5 Large VMs requested (5 * 4 = 20 PEs)
        ScenarioConfig config = new ScenarioConfig(
            "GoCJ_Dataset_1000.csv",
            List.of("FCFS"),
            10,
            1,
            1,
            5,
            new VmDistribution(0, 0, 5),
            1,
            42L,
            null,
            null
        );

        assertThrows(InsufficientCapacityException.class, () -> ScenarioFactory.buildVmSpecs(config));
    }

    @Test
    public void testMulberry32Determinism() {
        Mulberry32 rng1 = new Mulberry32(42L);
        Mulberry32 rng2 = new Mulberry32(42L);

        for (int i = 0; i < 100; i++) {
            assertEquals(rng1.nextDouble(), rng2.nextDouble());
            assertEquals(rng1.nextInt(10), rng2.nextInt(10));
        }
    }
}
