package id.ac.soka.scheduling.simulation;

import org.cloudbus.cloudsim.VmAllocationPolicy;
import org.cloudbus.cloudsim.core.GuestEntity;
import org.cloudbus.cloudsim.core.HostEntity;

import java.util.List;
import java.util.Map;

public class ExplicitVmAllocationPolicy extends VmAllocationPolicy {
    private final Map<Integer, Integer> vmToHostIndex;

    public ExplicitVmAllocationPolicy(List<? extends HostEntity> hostList, Map<Integer, Integer> vmToHostIndex) {
        super(hostList);
        this.vmToHostIndex = vmToHostIndex;
    }

    @Override
    public HostEntity findHostForGuest(GuestEntity guest) {
        Integer hostIdx = vmToHostIndex.get(guest.getId());
        if (hostIdx != null && hostIdx >= 0 && hostIdx < getHostList().size()) {
            HostEntity host = getHostList().get(hostIdx);
            if (host.isSuitableForGuest(guest)) {
                return host;
            }
        }
        return null;
    }

    @Override
    public List<GuestMapping> optimizeAllocation(List<? extends GuestEntity> guestList) {
        return null;
    }
}
