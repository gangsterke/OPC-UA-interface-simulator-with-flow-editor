import type { ConnectionProfile } from "./connection-profile";
import type { Tag } from "./tag";
import type { SequenceStep } from "./sequence-step";
import type { MethodDefinition } from "./method";

export interface ProjectMetadata {
  schemaVersion: number;
  createdAt: string;
  modifiedAt: string;
  appVersionAtSave: string;
}

export interface Project {
  metadata: ProjectMetadata;
  connectionProfile: ConnectionProfile;
  tags: Tag[];
  methods: MethodDefinition[];
  sequence: SequenceStep[];
}
