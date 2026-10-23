package id.ac.soka.scheduling.simulation;

import id.ac.soka.scheduling.model.VmSpec;

import java.util.ArrayList;
import java.util.List;

public class ScenarioFactory {
    public static final int HOST_PES = 16;
    public static final double HOST_PE_MIPS = 4000.0;
    public static final int HOST_RAM_MB = 32768;
    public static final long HOST_BW_MBPS = 10000;
    public static final long HOST_STORAGE_MB = 1000000;

    public static final double SMALL_MIPS = 500.0;
    public static final int SMALL_PES = 1;
    public static final int SMALL_RAM = 512;
    public static final long SMALL_BW = 500;
    public static final long SMALL_STORAGE = 10000;

    public static final double MEDIUM_MIPS = 1000.0;
    public static final int MEDIUM_PES = 2;
    public static final int MEDIUM_RAM = 1024;
    public static final long MEDIUM_BW = 1000;
    public static final long MEDIUM_STORAGE = 10000;

    public static final double LARGE_MIPS = 2000.0;
    public static final int LARGE_PES = 4;
    public static final int LARGE_RAM = 2048;
    public static final long LARGE_BW = 1000;
    public static final long LARGE_STORAGE = 10000;

    private static class HostResource {
        int pesAvailable = HOST_PES;
        int ramAvailable = HOST_RAM_MB;
        long bwAvailable = HOST_BW_MBPS;
        long storageAvailable = HOST_STORAGE_MB;

        boolean canAccommodate(int pes, int ram, long bw, long storage) {
            return pesAvailable >= pes &&
                   ramAvailable >= ram &&
                   bwAvailable >= bw &&
                   storageAvailable >= storage;
        }

        void allocate(int pes, int ram, long bw, long storage) {
            pesAvailable -= pes;
            ramAvailable -= ram;
            bwAvailable -= bw;
            storageAvailable -= storage;
        }
    }

    public static List<VmSpec> buildVmSpecs(ScenarioConfig config) {
        int totalVms = config.datacenters() * config.vmsPerDatacenter();
        List<VmSpec> vms = new ArrayList<>(totalVms);

        int currentVmId = 0;
        for (int dc = 0; dc < config.datacenters(); dc++) {
            HostResource[] hosts = new HostResource[config.hostsPerDatacenter()];
            for (int h = 0; h < hosts.length; h++) {
                hosts[h] = new HostResource();
            }

            // Order within DC: Small, then Medium, then Large
            List<VmTemplate> templates = new ArrayList<>(config.vmsPerDatacenter());
            for (int i = 0; i < config.vmDistribution().small(); i++) {
                templates.add(new VmTemplate("Small", SMALL_MIPS, SMALL_PES, SMALL_RAM, SMALL_BW, SMALL_STORAGE));
            }
            for (int i = 0; i < config.vmDistribution().medium(); i++) {
                templates.add(new VmTemplate("Medium", MEDIUM_MIPS, MEDIUM_PES, MEDIUM_RAM, MEDIUM_BW, MEDIUM_STORAGE));
            }
            for (int i = 0; i < config.vmDistribution().large(); i++) {
                templates.add(new VmTemplate("Large", LARGE_MIPS, LARGE_PES, LARGE_RAM, LARGE_BW, LARGE_STORAGE));
            }

            for (VmTemplate tmpl : templates) {
                int assignedHost = -1;
                for (int h = 0; h < hosts.length; h++) {
                    if (hosts[h].canAccommodate(tmpl.pes, tmpl.ram, tmpl.bw, tmpl.storage)) {
                        hosts[h].allocate(tmpl.pes, tmpl.ram, tmpl.bw, tmpl.storage);
                        assignedHost = h;
                        break;
                    }
                }
                if (assignedHost == -1) {
                    throw new InsufficientCapacityException(
                        "INSUFFICIENT_CAPACITY: Datacenter " + dc + " cannot accommodate VM " +
                        currentVmId + " (" + tmpl.type + ") across its " + config.hostsPerDatacenter() + " hosts."
                    );
                }
                vms.add(new VmSpec(
                    currentVmId++,
                    dc,
                    assignedHost,
                    tmpl.type,
                    tmpl.nominalMips,
                    tmpl.pes,
                    tmpl.ram,
                    tmpl.bw,
                    tmpl.storage
                ));
            }
        }
        return vms;
    }

    private record VmTemplate(
        String type,
        double nominalMips,
        int pes,
        int ram,
        long bw,
        long storage
    ) {}
}
