// Invoked by system OpenSSH, with stdout reserved exclusively for its response.
const { connect } = require("node:net");
const socket = connect(Number(process.env.TERMCO_ASKPASS_PORT), "127.0.0.1");
const fail = () => { socket.destroy(); process.exitCode = 1; };
socket.setTimeout(310_000, fail);
socket.on("error", fail);
socket.on("connect", () => socket.write(JSON.stringify({
  token: process.env.TERMCO_ASKPASS_TOKEN,
  prompt: process.argv[2] || "SSH password:",
  hint: process.env.SSH_ASKPASS_PROMPT || "",
}) + "\n"));
let buffer = "";
let received = false;
socket.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  if (buffer.length > 65_536) return fail();
  if (!buffer.includes("\n")) return;
  try {
    const { value } = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
    if (typeof value !== "string") return fail();
    received = true;
    process.stdout.write(value + "\n");
    socket.end();
  } catch { fail(); }
});
socket.on("end", () => { if (!received) fail(); });
