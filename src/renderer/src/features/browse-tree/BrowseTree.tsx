import { useEffect, useState } from "react";
import { useConnectionStore } from "../connection/connection-store";
import { BrowseTreeNodeRow } from "./BrowseTreeNode";
import type { BrowseTreeNode } from "@shared/models/browse-tree-node";

export function BrowseTree() {
  const status = useConnectionStore((s) => s.status);
  const isConnected = status.state === "connected";
  const [root, setRoot] = useState<BrowseTreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setRoot(null);
      return;
    }
    window.api.browse
      .resolveRootNode()
      .then(setRoot)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [isConnected]);

  return (
    <fieldset style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, maxWidth: 480, minHeight: 200 }}>
      <legend>Address Space</legend>
      {!isConnected && <p style={{ color: "#666" }}>Connect to an OPC UA server to browse its address space.</p>}
      {error && <p style={{ color: "#c92a2a" }}>{error}</p>}
      {isConnected && root && <BrowseTreeNodeRow node={root} depth={0} />}
    </fieldset>
  );
}
