export type ContainerSummary = {
  id?: string;
  names?: string;
  image?: string;
  state?: string;
  status?: string;
  Id?: string;
  ID?: string;
  Names?: string;
  Image?: string;
  State?: string;
  Status?: string;
};

export type ImageSummary = {
  id?: string;
  repository?: string;
  tag?: string;
  size?: string;
  Id?: string;
  ID?: string;
  Repository?: string;
  Tag?: string;
  Size?: string;
};

export type Volume = {
  name?: string;
  driver?: string;
  mountpoint?: string;
  scope?: string;
  Name?: string;
  Driver?: string;
  Mountpoint?: string;
  Scope?: string;
};

export type Network = {
  id?: string;
  name?: string;
  driver?: string;
  scope?: string;
  Id?: string;
  ID?: string;
  Name?: string;
  Driver?: string;
  Scope?: string;
};

export type AuditRecord = {
  at: string;
  action: string;
  target: string;
  result: string;
  detail?: string | null;
};

export type AuditListResponse = {
  records: AuditRecord[];
  total: number;
  from: number;
  limit: number;
  hasMore?: boolean;
  has_more?: boolean;
  nextFrom?: number;
  next_from?: number;
};

export type PullStartResponse = {
  message: string;
  taskId: string;
  task_id?: string;
};

export type PullProgressResponse = {
  taskId: string;
  task_id?: string;
  image: string;
  status: string;
  logs: string[];
  nextFrom: number;
  next_from?: number;
  done: boolean;
  error?: string | null;
};

export type HealthStatus = {
  message: string;
  dockerVersion: string;
  docker_version?: string;
};
