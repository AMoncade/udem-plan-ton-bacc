import { CadreProgramme } from "@/components/CadreProgramme";
import { VuePlan } from "@/components/VuePlan";

export const metadata = { title: "Trimestres" };

export default function PageTrimestres() {
  return (
    <CadreProgramme>
      <VuePlan />
    </CadreProgramme>
  );
}
