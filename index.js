const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")
const pino = require("pino")
const { Boom } = require("@hapi/boom")
const chalk = require("chalk")
const fs = require("fs")
const path = require("path")

async function startMugenKikaiBot() {
    const { state, saveCreds } = await useMultiFileAuthState('MugenKikaiSession')
    const { version } = await fetchLatestBaileysVersion()
    
    const conn = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    })

    if (!conn.authState.creds.registered) {
        console.log(chalk.yellow("Connection stabilizing... code appearing in 10s"))
        setTimeout(async () => {
            try {
                const phoneNumber = "2348076874766"
                const code = await conn.requestPairingCode(phoneNumber.trim())
                console.log(chalk.black(chalk.bgCyan(`Pairing Code: ${code}`)))
            } catch (e) {
                console.log(chalk.red("Error requesting code. Check if number is correct."))
            }
        }, 10000)
    }

    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode
            if (reason !== DisconnectReason.loggedOut) { 
                startMugenKikaiBot()
            }
        } else if (connection === "open") {
            console.log(chalk.green("Mugen Kikai-MD is Online"))
        }
    })

    conn.ev.on("creds.update", saveCreds)

    conn.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0]
            if (!m.message) return
            const from = m.key.remoteJid
            const type = Object.keys(m.message)[0]
            const body = (type === 'conversation') ? m.message.conversation : (type == 'extendedTextMessage') ? m.message.extendedTextMessage.text : ''
            
            if (body.startsWith('@ping')) {
                await conn.sendMessage(from, { text: 'Pong! 🎭 Mugen Kikai-MD is UP.' }, { quoted: m })
                return
            }

            if (!body.startsWith('@')) return
            const args = body.slice(1).trim().split(/ +/)
            const commandName = args.shift().toLowerCase()

            const commandsDir = path.join(__dirname, "commands")
            if (!fs.existsSync(commandsDir)) return

            const files = fs.readdirSync(commandsDir)
            for (const file of files) {
                if (file.endsWith(".js")) {
                    const commandFile = require(path.join(commandsDir, file))
                    if (commandFile.name === commandName) {
                        await commandFile.execute(conn, m, from, args, body)
                        break
                    }
                }
            }
        } catch (err) {
            console.log(err)
        }
    })
}

startMugenKikaiBot()
