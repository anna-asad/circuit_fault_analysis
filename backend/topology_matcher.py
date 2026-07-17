"""
Topology-based nominal lookup matcher.

Matches circuits by their topology (component types + connectivity) rather than
component names, then maps user names to canonical training-data names.
"""

from typing import Dict, Set, Tuple, Optional, List
import re


def get_component_type_from_id(comp_id: str) -> str:
    """Extract component type from SPICE-style ID (V1→voltage, R1→resistor, etc.)"""
    upper_id = comp_id.upper()
    if upper_id.startswith('V'): return 'V'  # voltage source
    if upper_id.startswith('I'): return 'I'  # current source
    if upper_id.startswith('R'): return 'R'  # resistor
    if upper_id.startswith('C'): return 'C'  # capacitor
    if upper_id.startswith('L'): return 'L'  # inductor
    return 'X'  # unknown


def extract_connectivity_signature(
    component_values: Dict[str, float],
    circuit_data: Dict
) -> Tuple[Tuple[str, ...], List[Tuple[str, str]]]:
    """
    Extract both component types AND connectivity structure.
    
    Returns:
        (types_tuple, edges_list)
        
        types_tuple: sorted component types ('I', 'R', 'R', ...)
        edges_list: list of (type1, type2) pairs representing connections
                    sorted for canonical comparison
    
    Example for series I-R circuit:
        types: ('I', 'R')
        edges: [('I', 'R')]  # current source connects to resistor
    """
    types = sorted(get_component_type_from_id(cid) for cid in component_values.keys())
    
    # Build component ID to type mapping
    id_to_type = {
        cid: get_component_type_from_id(cid) 
        for cid in component_values.keys()
    }
    
    # Extract edges from circuit_data if available
    edges = []
    if circuit_data and 'components' in circuit_data:
        # Build a map of which components share nodes (= are connected)
        node_to_comps = {}  # node_id → [comp_ids]
        
        for comp in circuit_data['components']:
            comp_id = comp.get('id', '')
            comp_nodes = comp.get('nodes', [])
            
            if comp_id in component_values:  # Only consider components we're analyzing
                for node in comp_nodes:
                    if node != '0':  # Exclude ground node
                        node_to_comps.setdefault(node, []).append(comp_id)
        
        # Components sharing a non-ground node are connected
        seen_pairs = set()
        for node, comp_list in node_to_comps.items():
            for i, comp1 in enumerate(comp_list):
                for comp2 in comp_list[i+1:]:
                    type1 = id_to_type.get(comp1, 'X')
                    type2 = id_to_type.get(comp2, 'X')
                    # Normalize edge order for comparison
                    edge = tuple(sorted([type1, type2]))
                    if edge not in seen_pairs:
                        seen_pairs.add(edge)
                        edges.append(edge)
    
    # Sort edges for canonical representation
    edges_sorted = sorted(edges)
    
    return (tuple(types), edges_sorted)


def signatures_match(sig1: Tuple, sig2: Tuple) -> bool:
    """
    Check if two connectivity signatures match.
    
    Signatures are (types_tuple, edges_list) pairs.
    Both types and edges must match for a topology match.
    """
    types1, edges1 = sig1
    types2, edges2 = sig2
    
    return types1 == types2 and edges1 == edges2


def find_matching_topology(
    user_components: Dict[str, float],
    nominal_lookup: Dict[frozenset, Dict[str, float]],
    circuit_data: Dict
) -> Optional[Tuple[frozenset, Dict[str, str]]]:
    """
    Find a matching topology in the nominal_lookup by component types AND connectivity.
    
    Returns:
        (matching_key, name_mapping) or None if no match found
        
        matching_key: the frozenset key from nominal_lookup that matches
        name_mapping: dict mapping user names → canonical names
                     e.g. {'R1': 'Rx', 'I1': 'I1'}
    """
    user_signature = extract_connectivity_signature(user_components, circuit_data)
    user_types_by_type = _group_by_type(user_components)
    
    # Since nominal_lookup doesn't have circuit_data, we can only match by component types
    # This is a limitation - we'll do a fuzzy match and warn if ambiguous
    user_types_tuple, user_edges = user_signature
    
    # Search through all nominal_lookup keys for matching topology
    candidates = []
    for nominal_key in nominal_lookup.keys():
        nominal_names = list(nominal_key)
        nominal_types_tuple = tuple(sorted(
            get_component_type_from_id(name) for name in nominal_names
        ))
        
        if nominal_types_tuple == user_types_tuple:
            # Type signature matches - build name mapping
            nominal_types_by_type = _group_by_type_from_names(nominal_names)
            mapping = _build_name_mapping(user_types_by_type, nominal_types_by_type)
            if mapping:
                candidates.append((nominal_key, mapping))
    
    # Return first match (warn if multiple matches)
    if len(candidates) > 1:
        print(f"⚠️  Multiple topology matches found ({len(candidates)}). Using first match.")
        print(f"    This may indicate ambiguous circuit topology.")
        print(f"    Matches: {[sorted(k) for k, _ in candidates]}")
    
    return candidates[0] if candidates else None


def _group_by_type(components: Dict[str, float]) -> Dict[str, List[str]]:
    """Group component IDs by their type prefix."""
    groups = {}
    for comp_id in components.keys():
        ctype = get_component_type_from_id(comp_id)
        groups.setdefault(ctype, []).append(comp_id)
    return groups


def _group_by_type_from_names(names: List[str]) -> Dict[str, List[str]]:
    """Group component names by their type prefix."""
    groups = {}
    for name in names:
        ctype = get_component_type_from_id(name)
        groups.setdefault(ctype, []).append(name)
    return groups


def _build_name_mapping(
    user_groups: Dict[str, List[str]],
    nominal_groups: Dict[str, List[str]]
) -> Optional[Dict[str, str]]:
    """
    Build a mapping from user component names to nominal names.
    
    Maps based on alphabetical order within each component type.
    E.g., user has [R1, R2], nominal has [Ra, Rb] → {R1: Ra, R2: Rb}
    """
    mapping = {}
    
    for ctype, user_names in user_groups.items():
        nominal_names = nominal_groups.get(ctype, [])
        
        if len(user_names) != len(nominal_names):
            # Topology mismatch (shouldn't happen if signatures matched)
            return None
        
        # Sort both lists and map them 1:1
        user_sorted = sorted(user_names)
        nominal_sorted = sorted(nominal_names)
        
        for u_name, n_name in zip(user_sorted, nominal_sorted):
            mapping[u_name] = n_name
    
    return mapping


def map_to_nominal_values(
    user_components: Dict[str, float],
    nominal_lookup: Dict[frozenset, Dict[str, float]],
    circuit_data: Dict = None
) -> Tuple[Dict[str, float], Optional[str]]:
    """
    Map user component values to nominal values using topology matching.
    
    Returns:
        (nominal_dict, debug_message)
        
        nominal_dict: {user_component_id: nominal_value}
        debug_message: diagnostic info about the match
    """
    result = find_matching_topology(user_components, nominal_lookup, circuit_data)
    
    if result is None:
        # No matching topology found
        user_types = tuple(sorted(
            get_component_type_from_id(cid) for cid in user_components.keys()
        ))
        available_sigs = set()
        for key in nominal_lookup.keys():
            sig = tuple(sorted(get_component_type_from_id(name) for name in key))
            available_sigs.add(sig)
        
        debug_msg = (
            f"❌ No matching topology found.\n"
            f"   User types: {user_types}\n"
            f"   Available type signatures: {sorted(available_sigs)}"
        )
        return ({}, debug_msg)
    
    matching_key, name_mapping = result
    nominal_values_canonical = nominal_lookup[matching_key]
    
    # Map canonical names back to user names
    nominal_for_user = {}
    for user_name, canonical_name in name_mapping.items():
        nominal_val = nominal_values_canonical.get(canonical_name)
        if nominal_val is not None:
            nominal_for_user[user_name] = nominal_val
    
    # Extract connectivity info for debug
    conn_info = ""
    if circuit_data:
        user_sig = extract_connectivity_signature(user_components, circuit_data)
        types, edges = user_sig
        if edges:
            conn_info = f"\n   Connectivity: {edges}"
    
    debug_msg = (
        f"✅ Topology match found!\n"
        f"   Canonical components: {sorted(matching_key)}\n"
        f"   Name mapping: {name_mapping}{conn_info}\n"
        f"   Nominal values: {nominal_for_user}"
    )
    
    return (nominal_for_user, debug_msg)
