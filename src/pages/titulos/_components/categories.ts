import { PuzzlePieceIcon, CpuChipIcon, WifiIcon, WrenchScrewdriverIcon, BuildingOffice2Icon, QuestionMarkCircleIcon, ArrowTopRightOnSquareIcon} from "@heroicons/react/24/outline";

const serviceStyles = {
  Aplicaciones: {
    icon: PuzzlePieceIcon,
    bg: "bg-violet-300",
  },
  Hardware: {
    icon: CpuChipIcon,
    bg: "bg-sky-300",
  },
  Conectividad: {
    icon: WifiIcon,
    bg: "bg-green-300",
  },
  Instalaciones: {
    icon: WrenchScrewdriverIcon,
    bg: "bg-orange-300",
  },
  Electoral: {
    icon: BuildingOffice2Icon,
    bg: "bg-red-300",
  },
  Externos: {
    icon: ArrowTopRightOnSquareIcon,
    bg: "bg-pink-300",
  },
  Otros: {
    icon: QuestionMarkCircleIcon,
    bg: "bg-neutral-300",
  },
} as const;

export default serviceStyles;