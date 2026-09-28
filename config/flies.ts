import type { Technology } from "../src/domain/types.ts";

/**
 * The fly box. Each fly is one precise client profile from the 2026-09-28
 * call with Paul. His point was that this takes specificity, not volume:
 * spend a few minutes being exact about the profile, then let the machine
 * find the ~100 companies that fit it.
 *
 * `gates` are hard, deterministic filters run in code. `rubric` holds the
 * judgment calls the qualifier (Claude) answers yes/no per criterion, with
 * evidence. A target must pass every gate and every `required` criterion.
 */
export interface FlyGates {
  technologies?: Technology[];
  minProjects?: number;
  maxProjects?: number;
  minMwOperational?: number;
  maxMwOperational?: number;
  /** Development + late development + construction. */
  minMwPipeline?: number;
  maxMwPipeline?: number;
  /** At least one project inside this size band. */
  minProjectMw?: number;
  maxProjectMw?: number;
  /** At least one project with projected COD inside this many months. */
  codWithinMonths?: number;
  /** RRC stream: active well count band. */
  minWells?: number;
  maxWells?: number;
}

export interface RubricItem {
  id: string;
  question: string;
  required: boolean;
}

export interface Fly {
  id: string;
  name: string;
  stream: "ercot" | "rrc" | "zoominfo";
  description: string;
  /** Paul's words, so the intent survives edits to the numbers. */
  rationale: string;
  gates: FlyGates;
  rubric: RubricItem[];
}

const COMMON_RUBRIC: RubricItem[] = [
  {
    id: "independent",
    question: "Is the owner an independent developer/IPP, not a major (oil major, utility, or top-10 national IPP) or a subsidiary of one?",
    required: true,
  },
  {
    id: "growing",
    question: "Is there evidence the owner is actively growing (new filings, recent financing, hiring, new projects announced in the last 24 months)?",
    required: true,
  },
  {
    id: "complexity",
    question: "Does the owner have a complex risk profile (multiple technologies, construction exposure, tax equity/transferability, lender requirements) where specialist advice adds value?",
    required: false,
  },
];

export const FLIES: Fly[] = [
  {
    id: "storage-platform",
    name: "Storage platform: ~600 MW operating, ~1.4 GW in development",
    stream: "ercot",
    description: "Battery storage owners with a meaningful operating fleet and a large development pipeline.",
    rationale:
      "\"I need two thousand megawatts of battery, six hundred in operations, fourteen hundred in development.\" A 100 MW storage project is ~$1M premium plus a ~$50M tax policy, about $1.5M in commission.",
    gates: {
      technologies: ["storage", "solar+storage", "wind+storage"],
      minMwOperational: 200,
      maxMwOperational: 1500,
      minMwPipeline: 800,
    },
    rubric: COMMON_RUBRIC,
  },
  {
    id: "solar-sweet-spot",
    name: "Solar developer: several ~300 MW projects (~1.5 GW total)",
    stream: "ercot",
    description: "Owners with roughly five utility-scale solar projects in the 150-600 MW band, some operating and some still coming.",
    rationale:
      "\"I need five solar projects equal to three hundred megawatts each, or about fifteen hundred megawatts of solar.\" 200 MW operating solar in Texas is ~$2.4M premium (~$240k commission). \"You want the ones that have like five or six and are just starting to grow.\"",
    gates: {
      technologies: ["solar", "solar+storage"],
      minProjects: 3,
      maxProjects: 12,
      minProjectMw: 150,
      maxProjectMw: 600,
      minMwPipeline: 300,
    },
    rubric: COMMON_RUBRIC,
  },
  {
    id: "near-term-construction",
    name: "Near-term construction: large solar/storage project hitting construction or COD by 2027",
    stream: "ercot",
    description: "A single large project entering construction soon. Builder's risk plus a tax policy make one project worth it on its own.",
    rationale:
      "\"A six hundred megawatt project... in late stage development... it'll hit construction or operations in twenty-seven.\" About $3M premium plus $3M tax commission; roughly $585k to the producer.",
    gates: {
      technologies: ["solar", "storage", "solar+storage", "wind+storage"],
      minProjectMw: 200,
      codWithinMonths: 18,
    },
    rubric: [
      COMMON_RUBRIC[0]!,
      {
        id: "not_placed",
        question: "Is there no public evidence the project's builder's risk and tax insurance are already placed (e.g., financing closed with a named broker)?",
        required: false,
      },
    ],
  },
  {
    id: "pipeline-heavy-ipp",
    name: "Pipeline-heavy IPP: ~600 MW operating, multi-GW pipeline",
    stream: "ercot",
    description: "The shape of the account Paul, Zach and Tommy looked at: modest operating fleet, huge pipeline.",
    rationale:
      "\"They've got six hundred megawatts in operation, but they have a huge pipeline, eight gigawatt pipeline.\" If they build 400 MW a year, that's another ~$1.5M plus tax every year.",
    gates: {
      minMwOperational: 300,
      maxMwOperational: 1500,
      minMwPipeline: 2000,
    },
    rubric: COMMON_RUBRIC,
  },
  {
    id: "og-operators",
    name: "Oil & gas operators with 50-300 wells",
    stream: "rrc",
    description: "Texas operators in Paul's sweet spot, from Railroad Commission permit and well data.",
    rationale:
      "\"The Texas Railroad Commission lists everybody that's gonna drill a well... sort it to those people that have between fifty and three hundred wells. That's our sweet spot.\"",
    gates: { minWells: 50, maxWells: 300 },
    rubric: [COMMON_RUBRIC[0]!, COMMON_RUBRIC[1]!],
  },
  {
    id: "oilfield-rental",
    name: "Oilfield service rental (Nova Compression lookalikes)",
    stream: "zoominfo",
    description: "Crane rental, compression rental, and downhole tool rental companies.",
    rationale: "\"Nova Compression, we should be going after oil field service. Crane rental, compression rental, downhole tool rental.\"",
    gates: {},
    rubric: [COMMON_RUBRIC[0]!, COMMON_RUBRIC[1]!],
  },
  {
    id: "rng-platform",
    name: "RNG platform with 5+ projects",
    stream: "zoominfo",
    description: "Renewable natural gas owners with five or more projects ($10-30M each). Usually not sophisticated buyers. They carry tax policies too.",
    rationale:
      "\"Renewable natural gas projects are somewhere between ten and thirty million each... typically not sophisticated buyers... They have tax policies with them.\"",
    gates: { minProjects: 5 },
    rubric: COMMON_RUBRIC,
  },
];

/**
 * Seed accounts for lookalike search. Paul: "Where were these companies like
 * two years ago? Go find me some today that look like these two years ago."
 * Names come from the transcript, so spellings are phonetic. Verify them.
 */
export const LOOKALIKE_SEEDS = {
  // "Avantus" was transcribed as "Advantis"; Primergy may now go by "Primergy Power".
  companies: ["Nightpeak Energy", "Primergy", "Avantus"],
  /** Projects of the right shape; find owners that have projects like these. */
  projects: ["Ash Creek", "Gemini", "Actina", "Longbow", "Spoken 1", "Spoken 2", "Fairy Mouse"],
};
