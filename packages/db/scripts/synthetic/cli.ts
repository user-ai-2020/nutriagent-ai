export type SeedCliOptions = {
  userId?: number;
  days: number;
  seed: number;
};

export class SeedCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedCliError";
  }
}

function readFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function parsePositiveInt(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new SeedCliError(`${flag} must be a non-negative integer`);
  }
  return value;
}

export function parseSeedCliArgs(argv = process.argv.slice(2)): SeedCliOptions {
  const userIdRaw = readFlag(argv, "--userId");
  const daysRaw = readFlag(argv, "--days");
  const seedRaw = readFlag(argv, "--seed");

  const userId = userIdRaw !== undefined ? parsePositiveInt(userIdRaw, "--userId") : undefined;
  if (userIdRaw !== undefined && (userId === undefined || userId <= 0)) {
    throw new SeedCliError("--userId must be a positive integer");
  }

  const days = daysRaw !== undefined ? parsePositiveInt(daysRaw, "--days") : 30;
  if (days === undefined || days <= 0) {
    throw new SeedCliError("--days must be a positive integer");
  }
  if (days > 366) {
    throw new SeedCliError("--days must be at most 366");
  }

  const seed = seedRaw !== undefined ? parsePositiveInt(seedRaw, "--seed") : 42_026;
  if (seed === undefined) {
    throw new SeedCliError("--seed must be a non-negative integer");
  }

  return { userId, days, seed };
}
