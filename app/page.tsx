import { CadreProgramme } from "@/components/CadreProgramme";
import { VueArbre } from "@/components/VueArbre";

export const metadata = { title: "Préalables" };

export default function PagePrealables() {
  return (
    <CadreProgramme>
      <VueArbre />
    </CadreProgramme>
  );
}
