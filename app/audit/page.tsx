import { CadreProgramme } from "@/components/CadreProgramme";
import { VueAudit } from "@/components/VueAudit";

export const metadata = { title: "Audit des blocs" };

export default function PageAudit() {
  return (
    <CadreProgramme>
      <VueAudit />
    </CadreProgramme>
  );
}
