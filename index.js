const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const P = require("pino")
const fs = require("fs")
const axios = require("axios")
const yts = require("yt-search")
const ytdl = require("ytdl-core")
const OpenAI = require("openai")
const config = require("./config")

const openai = new OpenAI({ apiKey: config.OPENAI_KEY })

let premiumUsers = JSON.parse(fs.readFileSync("./premium.json"))

async function startBot() {

  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    version,
    auth: state,
    browser: [config.BOT_NAME, "Chrome", "1.0"]
  })

  // PAIRING CODE
  if (!sock.authState.creds.registered) {
    const code = await sock.requestPairingCode(config.OWNER)
    console.log("PAIRING CODE:", code)
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || from
    const body = msg.message.conversation ||
      msg.message.extendedTextMessage?.text || ""

    // AUTO VIEW STATUS
    if (config.AUTO_VIEW_STATUS && from === "status@broadcast") {
      await sock.readMessages([msg.key])
      return
    }

    // MENU
    if (body === ".menu") {
      await sock.sendMessage(from, {
        text: `🔥 ${config.BOT_NAME} 🔥

.menu
.song
.tiktok
.sticker
.ai
.addprem
.delprem
.owner`
      })
    }

    // SONG DOWNLOAD
    if (body.startsWith(".song")) {
      const query = body.replace(".song", "").trim()
      const search = await yts(query)
      const video = search.videos[0]
      const stream = ytdl(video.url, { filter: "audioonly" })
      const file = "./song.mp3"
      stream.pipe(fs.createWriteStream(file))
      stream.on("end", async () => {
        await sock.sendMessage(from, {
          audio: fs.readFileSync(file),
          mimetype: "audio/mp4"
        })
        fs.unlinkSync(file)
      })
    }

    // TIKTOK DOWNLOAD
    if (body.startsWith(".tiktok")) {
      const url = body.split(" ")[1]
      const res = await axios.get(`https://tikwm.com/api/?url=${url}`)
      await sock.sendMessage(from, {
        video: { url: res.data.data.play },
        caption: "Downloaded by KALI MD"
      })
    }

    // STICKER
    if (body === ".sticker" && msg.message.imageMessage) {
      const buffer = await sock.downloadMediaMessage(msg)
      await sock.sendMessage(from, {
        sticker: buffer
      })
    }

    // AI CHAT
    if (body.startsWith(".ai")) {
      if (!config.OPENAI_KEY) return
      const prompt = body.replace(".ai", "")
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      })
      await sock.sendMessage(from, {
        text: completion.choices[0].message.content
      })
    }

    // PREMIUM ADD
    if (body.startsWith(".addprem") && sender.includes(config.OWNER)) {
      const user = body.split(" ")[1]
      premiumUsers.push(user)
      fs.writeFileSync("./premium.json", JSON.stringify(premiumUsers))
      await sock.sendMessage(from, { text: "Premium added" })
    }

    // ANTI DELETE
    sock.ev.on("messages.update", async (updates) => {
      if (!config.ANTI_DELETE) return
      for (const update of updates) {
        if (update.update.message === null) {
          await sock.sendMessage(update.key.remoteJid, {
            text: "🚫 Message Deleted!"
          })
        }
      }
    })

  })

  sock.ev.on("connection.update", (update) => {
    if (update.connection === "close") {
      const shouldReconnect =
        update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

}

startBot()