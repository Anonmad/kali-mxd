require("dotenv").config()

module.exports = {
  OWNER: process.env.OWNER || "255619615065",
  AUTO_VIEW_STATUS: true,
  ANTI_DELETE: true,
  OPENAI_KEY: process.env.OPENAI_KEY || "",
  BOT_NAME: "KALI MD"
}