export type RegisteredCoach = {
  coachPeerId: string;
  coachMultiaddrs: string[];
  registeredAtMs: number;
};

export class RelayCoachRegistry {
  private current: RegisteredCoach | null = null;

  register(entry: RegisteredCoach): void {
    this.current = entry;
  }

  getCurrent(): RegisteredCoach | null {
    return this.current;
  }

  getCurrentCoachPeerId(): string | null {
    return this.current?.coachPeerId ?? null;
  }
}
