import { useEffect } from "react";
import { useConnectionStore } from "./features/connection/connection-store";
import { ConnectionPanel } from "./features/connection/ConnectionPanel";
import { ConnectionStatusBadge } from "./features/connection/ConnectionStatusBadge";
import { CertificateTrustDialog } from "./features/certificates/CertificateTrustDialog";
import { BrowseTree } from "./features/browse-tree/BrowseTree";
import { TagsPanel } from "./features/tags/TagsPanel";
import { MethodsPanel } from "./features/methods/MethodsPanel";
import { SequenceBuilder } from "./features/sequence/SequenceBuilder";
import { RunPanel } from "./features/run/RunPanel";
import { ProjectToolbar } from "./features/project/ProjectToolbar";
import { DndProvider } from "./dnd/DndProvider";

function App() {
  const initConnection = useConnectionStore((s) => s.init);

  useEffect(() => {
    initConnection();
  }, [initConnection]);

  return (
    <DndProvider>
      <div style={{ fontFamily: "sans-serif", padding: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Interface Simulator</h1>
          <ConnectionStatusBadge />
        </header>
        <ProjectToolbar />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ConnectionPanel />
          <BrowseTree />
          <TagsPanel />
          <MethodsPanel />
          <SequenceBuilder />
          <RunPanel />
        </div>
        <CertificateTrustDialog />
      </div>
    </DndProvider>
  );
}

export default App;
