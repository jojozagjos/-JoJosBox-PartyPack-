const BAD = [
  "fuck","shit","bitch","cunt","asshole","nigger","faggot","retard",
  "slut","whore","dick","cock","pussy","twat","wank","cum","sperm"
];

export function hasProfanity(s="") {
  const w = (s || "").toLowerCase();
  return BAD.some(b => w.includes(b));
}
export function sanitizeName(s="Player") {
  let v = (s || "").trim().slice(0, 24);
  if (!v) v = "Player";
  if (hasProfanity(v)) v = "Player";
  return v;
}
export function sanitizeText(s="", max=500) {
  let v = (s || "").slice(0, max);
  if (hasProfanity(v)) {
    // mask inner letters but keep length
    v = v.replace(/[A-Za-z]/g, "*");
  }
  return v;
}
