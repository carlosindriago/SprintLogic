import collections
import os


def collapse_graph_by_density(nodes, links, max_density=15, expanded_folders=None):
    if expanded_folders is None:
        expanded_folders = set()

    folder_files = collections.defaultdict(list)
    for n in nodes:
        folder = n.get("folder", "/")
        folder = folder.strip("/")
        if not folder:
            folder = "/"
        folder_files[folder].append(n)

    all_folders = set(folder_files.keys())
    added_parents = True
    while added_parents:
        added_parents = False
        parents = set()
        for f in all_folders:
            if f != "/":
                parent = os.path.dirname(f)
                if not parent:
                    parent = "/"
                if parent not in all_folders:
                    parents.add(parent)
                    added_parents = True
        all_folders.update(parents)

    sorted_folders = sorted(list(all_folders), key=lambda x: x.count('/'), reverse=True)
    if "/" in sorted_folders:
        sorted_folders.remove("/")
        sorted_folders.append("/")

    node_redirect = {}
    final_nodes = {}
    folder_items = {f: [n for n in folder_files.get(f, [])] for f in sorted_folders}

    internal_links = []

    for folder in sorted_folders:
        items = folder_items[folder]

        is_expanded = folder in expanded_folders or any(ef.startswith(folder + "/") for ef in expanded_folders)

        if len(items) > max_density and folder != "/":
            mod_id = f"module:{folder}"
            mod_node = {
                "id": mod_id,
                "label": "Module",
                "name": os.path.basename(folder).upper(),
                "file_path": folder,
                "folder": os.path.dirname(folder) if os.path.dirname(folder) else "/",
                "size": 3000 + len(items) * 100,
                "in_degree": 0,
                "out_degree": 0,
                "children_count": len(items)
            }

            def redirect_all(item, target_id):
                if item.get("label") == "Module":
                    for orig_id, current_target in list(node_redirect.items()):
                        if current_target == item["id"]:
                            node_redirect[orig_id] = target_id
                else:
                    node_redirect[item["id"]] = target_id

            if not is_expanded:
                # Completely collapsed
                for item in items:
                    redirect_all(item, mod_id)
                parent = os.path.dirname(folder)
                if not parent:
                    parent = "/"
                folder_items[parent].append(mod_node)
            else:
                # Expanded! Keep the module node, BUT also keep the children as themselves!
                # Do NOT redirect the children to the module for external links (they maintain their own links).
                # Actually, wait. If they keep their own external links, they connect to the rest of the graph.
                final_nodes[mod_id] = mod_node
                for item in items:
                    final_nodes[item["id"]] = item
                    if item.get("label") != "Module":
                        node_redirect[item["id"]] = item["id"]
                    # Add strong internal link to the parent module
                    internal_links.append({
                        "source": item["id"],
                        "target": mod_id,
                        "type": "internal_cluster",
                        "is_cycle": False,
                        "weight": 10  # High weight to keep them close
                    })
                # The module node itself doesn't need to be bubbled up to the parent folder's items,
                # because the items themselves will bubble up or remain.
                # Wait, if we don't bubble the module up, it's just a floating node connected to its children.
                # Which is PERFECT! It acts as the gravity center.
        else:
            for item in items:
                final_nodes[item["id"]] = item
                if item.get("label") != "Module":
                    node_redirect[item["id"]] = item["id"]

    final_links = {}
    for link in links:
        src = node_redirect.get(link["source"])
        tgt = node_redirect.get(link["target"])
        if src and tgt and src != tgt:
            edge_id = f"{src}->{tgt}"
            if edge_id not in final_links:
                final_links[edge_id] = {
                    "source": src,
                    "target": tgt,
                    "type": "depends_on",
                    "is_cycle": False,
                    "weight": 1
                }
            else:
                final_links[edge_id]["weight"] += 1

    # Add internal links
    for link in internal_links:
        edge_id = f"{link['source']}->{link['target']}"
        final_links[edge_id] = link

    for edge in final_links.values():
        if edge["source"] in final_nodes:
            final_nodes[edge["source"]]["out_degree"] = final_nodes[edge["source"]].get("out_degree", 0) + edge["weight"]
        if edge["target"] in final_nodes:
            final_nodes[edge["target"]]["in_degree"] = final_nodes[edge["target"]].get("in_degree", 0) + edge["weight"]

    return {"nodes": list(final_nodes.values()), "links": list(final_links.values())}


