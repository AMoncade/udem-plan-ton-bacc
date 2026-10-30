/**
 * Compile le moteur partagé et le met en archive pour ClientSide Horaire.
 *
 *   npm run moteur:paquet               → packages/moteur/<nom>-<version>.tgz
 *   npm run moteur:paquet -- --sale     → autorise un arbre modifié (essai local)
 *
 * POURQUOI UNE ARCHIVE. L'extension doit rester constructible par `npm ci` seul
 * (AMO l'exige pour Firefox) : un `file:../udem-plan-ton-bacc` dépendrait d'un
 * dossier voisin, et npm ne sait pas installer un sous-dossier d'un dépôt git.
 * L'archive est versée dans `vendor/` de l'extension et figée par l'empreinte
 * sha512 de son `package-lock.json`.
 *
 * POURQUOI REFUSER UN ARBRE MODIFIÉ. L'archive grave le commit dont elle sort
 * (`dist/PROVENANCE.json`). Si le moteur a des changements non commités, ce
 * commit mentirait sur le code réellement empaqueté — et c'est précisément
 * l'attestation qu'on lira le jour où l'extension et l'app web ne s'accordent
 * pas.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(import.meta.dirname, "..");
const PAQUET = join(RACINE, "packages", "moteur");
const sale = process.argv.includes("--sale");

/** Les chemins dont le contenu finit dans l'archive. */
const SOURCES = ["lib", "app/_lib", "packages/moteur"];

function git(...args) {
  return execFileSync("git", args, { cwd: RACINE, encoding: "utf8" }).trim();
}

const modifies = git("status", "--porcelain", "--", ...SOURCES);
if (modifies !== "" && !sale) {
  console.error(
    "Arbre modifié sous " + SOURCES.join(", ") + " :\n" + modifies + "\n\n" +
      "L'archive graverait un commit qui ne décrit pas son contenu. Committer " +
      "d'abord, ou relancer avec --sale pour un essai local.",
  );
  process.exit(1);
}

rmSync(join(PAQUET, "dist"), { recursive: true, force: true });
// Le compilateur du dépôt, lancé par node : ni `npx` (qui téléchargerait un
// paquet homonyme si typescript manquait), ni shell.
execFileSync(process.execPath, [join(RACINE, "node_modules", "typescript", "bin", "tsc"), "-p", join(PAQUET, "tsconfig.json")], {
  cwd: RACINE,
  stdio: "inherit",
});

const commit = git("rev-parse", "HEAD");
writeFileSync(
  join(PAQUET, "dist", "PROVENANCE.json"),
  JSON.stringify({ commit, sale: modifies !== "" }, null, 2) + "\n",
);

const sortie = execFileSync(
  "npm",
  ["pack", "--json", "--pack-destination", PAQUET],
  { cwd: PAQUET, encoding: "utf8", shell: process.platform === "win32" },
);
const [{ filename }] = JSON.parse(sortie);
const archive = join(PAQUET, filename);
const sha512 = createHash("sha512").update(readFileSync(archive)).digest("base64");

console.log(`\n${archive}`);
console.log(`commit    ${commit}${modifies !== "" ? " (arbre modifié)" : ""}`);
console.log(`integrity sha512-${sha512}`);
