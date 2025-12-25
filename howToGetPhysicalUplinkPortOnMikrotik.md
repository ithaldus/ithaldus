On MikroTik RouterOS this situation is **normal**: L3 (IP/DHCP) lives on a **bridge**, while the actual upstream is one of the **bridge member ports**.
You must determine **which bridge port currently forwards traffic to the DHCP server / default gateway**.

There is no single flag called “upstream port”. You infer it using L2/L3 data.

---

## Reliable methods (programmatic)

### 1. Check which bridge port learned the **gateway’s MAC address** (best method)

This is the most reliable and automation-friendly approach.

**Logic**

* DHCP client on the bridge receives:

  * default gateway IP
* Resolve gateway IP → MAC
* Check **bridge host table** to see **which port learned that MAC**

**Steps**

```routeros
# 1. Get default gateway
/ip route get [find dst-address=0.0.0.0/0 active=yes] gateway
```

```routeros
# 2. Get ARP entry for gateway
/ip arp print where address=<gateway-ip>
```

```routeros
# 3. Find which bridge port learned that MAC
/interface bridge host print where mac-address=<gateway-mac>
```

**Result**

* `on-interface=etherX` → **this is the upstream port**

This works even if:

* VLANs are involved
* Multiple ports exist in the bridge
* STP is enabled

---

### 2. Use bridge host table traffic counters (heuristic)

If ARP info is temporarily missing:

```routeros
/interface bridge host print
```

Look for:

* MACs with **large rx/tx byte counters**
* Especially ones that are **not local devices**

Typically the upstream port aggregates traffic.

Less precise than Method 1, but useful.

---

### 3. Check STP / RSTP root port (if STP enabled)

If the bridge runs STP/RSTP:

```routeros
/interface bridge port print where role=root
```

* The **root port** usually points upstream
* Not guaranteed in all topologies

---

### 4. Torch the bridge ports (runtime detection)

For real-time detection:

```routeros
/tool torch ether1
/tool torch ether2
```

The upstream port will show:

* DHCP replies
* ARP replies
* Traffic to gateway IP

Useful for diagnostics, not ideal for automation.

---

## What does *not* work

* DHCP client interface name → always `bridge`
* `/interface ethernet monitor` → physical link only
* IP address assignment → abstracted at bridge level

---

## Recommended automation logic (summary)

1. Read active default route
2. Resolve gateway MAC via ARP
3. Map MAC → bridge port via `/interface bridge host`
4. That port = upstream

This is exactly how network analyzers and topology mappers do it.

## 1) RouterOS script: determine upstream physical port (gateway MAC → bridge host)

Works when IP/DHCP is on `bridge` and upstream is some `etherX` (or a VLAN sub-interface).

```routeros
# Upstream-port discovery for RouterOS (bridge L3, physical L2)
# Output: prints upstream "on-interface" (often etherX; may be vlanX if tagged)

:local BR "bridge"

# 1) Find active default route gateway
:local defRouteId [/ip/route find where dst-address="0.0.0.0/0" && active=yes]
:if ([:len $defRouteId] = 0) do={
  :error "No active default route found"
}

:local gw [/ip/route get $defRouteId gateway]
:if ($gw = "") do={ :error "Default route has no gateway" }

# Some configs can have multiple gateways like "1.2.3.4%bridge,5.6.7.8%bridge"
# Take the first token before comma, and strip any "%iface" suffix.
:local gwFirst [:pick $gw 0 [:find $gw ","]]
:if ([:len $gwFirst] = 0) do={ :set gwFirst $gw }

:local pctPos [:find $gwFirst "%"]
:if ($pctPos != -1) do={ :set gwFirst [:pick $gwFirst 0 $pctPos] }

# 2) Ensure ARP for gateway exists (ping once if needed)
:local gwArpId [/ip/arp find where address=$gwFirst]
:if ([:len $gwArpId] = 0) do={
  /ping $gwFirst count=1 interval=200ms >/dev/null
  :set gwArpId [/ip/arp find where address=$gwFirst]
}

:if ([:len $gwArpId] = 0) do={
  :error ("No ARP entry for gateway " . $gwFirst)
}

:local gwMac [/ip/arp get $gwArpId mac-address]
:if ($gwMac = "") do={ :error "Gateway MAC not found in ARP table" }

# 3) Map gateway MAC -> bridge port (host table)
:local hostId [/interface/bridge/host find where bridge=$BR && mac-address=$gwMac]
:if ([:len $hostId] = 0) do={
  :error ("Gateway MAC " . $gwMac . " not found in /interface bridge host for bridge " . $BR)
}

:local upIf [/interface/bridge/host get $hostId on-interface]

:put ("gateway_ip=" . $gwFirst)
:put ("gateway_mac=" . $gwMac)
:put ("upstream_on_interface=" . $upIf)
```

### Notes

* `upstream_on_interface` will typically be `ether1`, but can also be:

  * a VLAN interface (e.g. `vlan100`) if the gateway MAC is learned on a tagged interface
  * a bonding interface, etc.

---

## 2) “AI-agent friendly” algorithm description (step-by-step)

1. Identify the L3 interface used for WAN: it may be `bridge`, not a physical port.
2. Query the **active default route** (`0.0.0.0/0`) to obtain the current **gateway IP**.
3. Resolve the gateway IP to a **MAC address** using the ARP/neighbor table.

   * If ARP entry is missing, generate traffic to the gateway (e.g. one ping) and retry.
4. Look up that MAC in the **bridge host (FDB) table** for the bridge.
5. The FDB entry contains `on-interface` → treat this as the **current upstream interface**.
6. If `on-interface` is a VLAN interface and you need the underlying physical:

   * resolve the VLAN interface’s `interface` property (parent)
   * repeat until you reach a physical interface (ether/bond).

Failure handling:

* No default route → device has no upstream at L3 yet.
* No ARP for gateway → gateway not reachable / no traffic / wrong bridge/VLAN.
* No host table entry → bridge filtering or MAC not learned yet (generate traffic and retry).

---

## 3) VLAN-filtered bridge / tagged uplink handling

### Case A: Upstream learned directly on `etherX`

* `bridge host` shows `on-interface=etherX` → you’re done.

### Case B: Upstream learned on `vlanXXX` (common when WAN is tagged)

You still get a correct upstream interface, but it’s not physical. To get the physical parent:

```routeros
:local ifname $upIf

:while (true) do={
  :local t [/interface get [find where name=$ifname] type]
  :if ($t = "vlan") do={
    :local parent [/interface/vlan get [find where name=$ifname] interface]
    :set ifname $parent
  } else={
    :break
  }
}

:put ("upstream_physical_or_base_interface=" . $ifname)
```

This will reduce `vlan100 -> ether1` (or `bond1`, etc.).

---

## 4) Programmatic via RouterOS API (what to query)

If you’re doing this from your own software (REST/RouterOS API), do the same sequence with these resources:

1. **Default route**

* `/ip/route/print` with filter `dst-address=0.0.0.0/0` and `active=true`
* read `gateway`

2. **ARP**

* `/ip/arp/print` filter `address=<gw-ip>`
* read `mac-address`
* if missing: issue ping command once and retry

3. **Bridge host**

* `/interface/bridge/host/print` filter `bridge=<bridgeName>` and `mac-address=<gw-mac>`
* read `on-interface`

4. Optional VLAN parent unwind

* if `on-interface` is VLAN:

  * `/interface/vlan/print` filter `name=<on-interface>` → read `interface` (parent)
  * repeat until non-VLAN

---

## 5) Practical robustness tips

* If multiple default routes exist (failover), always pick the one with `active=yes` and lowest distance / routing-mark you’re using.
* If ARP is empty on cold start, send a single ping to the gateway and retry host lookup.
* If the gateway is behind a modem doing MAC hiding (rare), fallback to the DHCP server identifier MAC (if available) or to “largest traffic port” heuristic.

---

Below is a **clean, production-safe solution for both RouterOS v6 and v7**, with **one script per version**, plus a **shared algorithm contract** so you can embed it into tooling.

The logic is identical; only the **route lookup differs** between v6 and v7.

---

# RouterOS v6 script (stable + compatible)

Works on v6.x where `/ip route get gateway` behaves differently.

```routeros
# ===== CONFIG =====
:local BR "bridge"

# ===== 1) Find active default route =====
:local defRouteId [/ip route find where dst-address="0.0.0.0/0" && active=yes]
:if ([:len $defRouteId] = 0) do={
  :error "No active default route"
}

# v6 returns gateway as property
:local gw [/ip route get $defRouteId gateway]
:if ($gw = "") do={ :error "Default route has no gateway" }

# Strip interface suffix (1.2.3.4%bridge)
:local pctPos [:find $gw "%"]
:if ($pctPos != -1) do={ :set gw [:pick $gw 0 $pctPos] }

# ===== 2) Ensure ARP exists =====
:local arpId [/ip arp find where address=$gw]
:if ([:len $arpId] = 0) do={
  /ping $gw count=1 interval=200ms >/dev/null
  :set arpId [/ip arp find where address=$gw]
}

:if ([:len $arpId] = 0) do={
  :error ("No ARP entry for gateway " . $gw)
}

:local gwMac [/ip arp get $arpId mac-address]

# ===== 3) Find bridge port that learned gateway MAC =====
:local hostId [/interface bridge host find where bridge=$BR && mac-address=$gwMac]
:if ([:len $hostId] = 0) do={
  :error ("Gateway MAC not found in bridge host table")
}

:local upIf [/interface bridge host get $hostId on-interface]

:put ("gateway_ip=" . $gw)
:put ("gateway_mac=" . $gwMac)
:put ("upstream_interface=" . $upIf)
```

---

# RouterOS v7 script (route-aware, multi-gateway safe)

Handles **multiple gateways**, routing marks, and new v7 route output.

```routeros
# ===== CONFIG =====
:local BR "bridge"

# ===== 1) Find active default route =====
:local defRouteId [/ip route find where dst-address="0.0.0.0/0" && active=yes]
:if ([:len $defRouteId] = 0) do={
  :error "No active default route"
}

# v7 may return "1.2.3.4%bridge,5.6.7.8%bridge"
:local gwRaw [/ip route get $defRouteId gateway]
:if ($gwRaw = "") do={ :error "Default route has no gateway" }

# Take first gateway
:local gwFirst [:pick $gwRaw 0 [:find $gwRaw ","]]
:if ([:len $gwFirst] = 0) do={ :set gwFirst $gwRaw }

# Strip %interface
:local pctPos [:find $gwFirst "%"]
:if ($pctPos != -1) do={ :set gwFirst [:pick $gwFirst 0 $pctPos] }

# ===== 2) Ensure ARP exists =====
:local arpId [/ip arp find where address=$gwFirst]
:if ([:len $arpId] = 0) do={
  /ping $gwFirst count=1 interval=200ms >/dev/null
  :set arpId [/ip arp find where address=$gwFirst]
}

:if ([:len $arpId] = 0) do={
  :error ("No ARP entry for gateway " . $gwFirst)
}

:local gwMac [/ip arp get $arpId mac-address]

# ===== 3) Find bridge port that learned gateway MAC =====
:local hostId [/interface bridge host find where bridge=$BR && mac-address=$gwMac]
:if ([:len $hostId] = 0) do={
  :error ("Gateway MAC not found in bridge host table")
}

:local upIf [/interface bridge host get $hostId on-interface]

:put ("gateway_ip=" . $gwFirst)
:put ("gateway_mac=" . $gwMac)
:put ("upstream_interface=" . $upIf)
```

---

# Optional: resolve VLAN → physical interface (v6 + v7)

If `upstream_interface=vlanXXX` and you need the **actual physical uplink**:

```routeros
:local ifname $upIf

:while (true) do={
  :local t [/interface get [find where name=$ifname] type]
  :if ($t = "vlan") do={
    :set ifname [/interface vlan get [find where name=$ifname] interface]
  } else={
    :break
  }
}

:put ("upstream_physical_interface=" . $ifname)
```

---

# Shared algorithm contract (for external software / AI agents)

**Goal:** determine upstream physical port when L3 is on a bridge.

1. Query active default route (`0.0.0.0/0`)
2. Extract first gateway IP (strip `%iface`, commas)
3. Resolve gateway IP → MAC via ARP
4. Query bridge FDB (`/interface bridge host`)
5. Find entry with that MAC
6. Read `on-interface`
7. If VLAN → walk parent until physical

**Why this works**

* RouterOS bridges are pure L2
* DHCP/IP abstraction hides physical uplink
* Gateway MAC is always learned on the true upstream port
* Bridge FDB is authoritative

---

# Failure modes (expected and correct)

| Condition               | Meaning                           |
| ----------------------- | --------------------------------- |
| No default route        | No upstream yet                   |
| No ARP                  | Gateway unreachable or no traffic |
| MAC not in bridge host  | Bridge filtering or cold start    |
| VLAN interface returned | Tagged uplink (normal)            |

---

also possible:

* a **single auto-detect script** that branches on v6/v7
* a **RouterOS API query sequence** (JSON-like)
* logic for **multi-WAN failover detection**
* logic for **bonded uplinks**

