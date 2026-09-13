import { CadreProgramme } from "@/components/CadreProgramme";
import { VueSession } from "@/components/VueSession";

export const metadata = { title: "Prochaine session" };

export default function PageSession() {
  return (
    <CadreProgramme>
      <VueSession />
    </CadreProgramme>
  );
}
