const {
    default: makeWASocket,
    MessageType,
    MessageOptions,
    Mimetype,
    DisconnectReason,
    BufferJSON,
    AnyMessageContent,
    delay,
    fetchLatestBaileysVersion,
    isJidBroadcast,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    MessageRetryMap,
    useMultiFileAuthState,
    msgRetryCounterMap,
} = require("@whiskeysockets/baileys");

const log = (pino = require("pino"));
const { session } = { session: "session_auth_info" };
const { Boom } = require("@hapi/boom");
const path = require("path");
const fs = require("fs");
const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = require("express")();
// enable files upload
app.use(
    fileUpload({
        createParentPath: true,
    })
);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const port = process.env.PORT || 8001;
const qrcode = require("qrcode");

app.get("/scan", (req, res) => {
    res.send("hoolehay");
});

app.get("/", (req, res) => {
    res.send("server working");
});

let sock;
let qrDinamic;
let soket;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("session_auth_info");

    sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: log({ level: "silent" }),
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        qrDinamic = qr;
        if (connection === "close") {
            let reason = new Boom(lastDisconnect.error).output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(
                    `Bad Session File, Please Delete ${session} and Scan Again`
                );
                sock.logout();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("Conexão fechada, reconectando...");
                connectToWhatsApp();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("Conexão perdida com o servidor, reconectando...");
                connectToWhatsApp();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log(
                    "Conexão substituída, nova sessão aberta, encerre a sessão atual primeiro."
                );
                sock.logout();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(
                    `Dispositivo fechado, elimine ${session} e escaneie de novo.`
                );
                sock.logout();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("Necessário reset, reiniciando...");
                connectToWhatsApp();
            } else if (reason === DisconnectReason.timedOut) {
                console.log("Tempo de conexão excedido, conectando...");
                connectToWhatsApp();
            } else {
                sock.end(
                    `Motivo de desconexão desconhecido: ${reason}|${lastDisconnect.error}`
                );
            }
        } else if (connection === "open") {
            console.log("Conexão ativa");
            return;
        }
    });

    sock.ev.on("messages.upsert", async (msg) => {
        console.log(msg.messages[0].key);
        
        /*if(msg.messages[0].key.fromMe == false && msg.messages[0].key.remoteJid.includes('@s.whatsapp.net')) {
            sock.sendMessage(msg.messages[0].key.remoteJid, { text : "horray" });
        }*/
        
    });

    sock.ev.on("creds.update", saveCreds);
}

const isConnected = () => {
    return sock?.user ? true : false;
};

app.get("/send-message", async (req, res) => {
    const tempMessage = req.query.message;
    const number = req.query.number;

    let numberWA;
    try {
        if (!number) {
            res.status(500).json({
                status: false,
                response: "O numero não existe",
            });
        } else {
            numberWA = number + "@s.whatsapp.net";

            if (isConnected()) {


                const exist = await sock.onWhatsApp(numberWA);

                if (exist?.jid || (exist && exist[0]?.jid)) {
                    sock
                        .sendMessage(exist.jid || exist[0].jid, {
                            text: tempMessage,
                        })
                        .then((result) => {
                            res.status(200).json({
                                status: true,
                                response: result,
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: false,
                                response: err,
                            });
                        });
                }
            } else {
                res.status(500).json({
                    status: false,
                    response: "Não está conectado",
                });
            }
        }
    } catch (err) {
        res.status(500).send(err);
    }
});

/*
//Recurso é não-confiável, whatsapp cria metadados capazes de diferenciar se é uma fonte não oficial e não renderiza
app.get("/send-link", async (req, res) => {
    const tempMessage = req.query.message;
    const link = req.query.link;
    const number = req.query.number;

    let numberWA;
    try {
        if (!number) {
            res.status(500).json({
                status: false,
                response: "O numero não existe",
            });
        } else {
            numberWA = number + "@s.whatsapp.net";

            if (isConnected()) {


                const exist = await sock.onWhatsApp(numberWA);

                const templateButtons = [
                    {index: 1, urlButton: {displayText: '⭐ BOTÃO!', url: link}}
                ]
                
                const templateMessage = {
                    text: tempMessage,
                    footer: 'footer',
                    templateButtons: templateButtons
                }

                if (exist?.jid || (exist && exist[0]?.jid)) {
                    sock
                        .sendMessage(exist.jid || exist[0].jid, 
                            templateMessage
                        )
                        .then((result) => {
                            res.status(200).json({
                                status: true,
                                response: result,
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: false,
                                response: err,
                            });
                        });
                }
            } else {
                res.status(500).json({
                    status: false,
                    response: "Não está conectado",
                });
            }
        }
    } catch (err) {
        res.status(500).send(err);
    }
});
*/

io.on("connection", async (socket) => {
    soket = socket;
    if (isConnected()) {
        updateQR("connected");
    } else if (qrDinamic) {
        updateQR("qr");
    }
});

const updateQR = (data) => {
    switch (data) {
        case "qr":
            qrcode.toDataURL(qrDinamic, (err, url) => {
                soket?.emit("qr", url);
                soket?.emit("log", "QR recibido , scan");
            });
            break;
        case "connected":
            soket?.emit("qrstatus", "./assets/check.svg");
            soket?.emit("log", " usaario conectado");
            const { id, name } = sock?.user;
            var userinfo = id + " " + name;
            soket?.emit("user", userinfo);

            break;
        case "loading":
            soket?.emit("qrstatus", "./assets/loader.gif");
            soket?.emit("log", "Cargando ....");

            break;
        default:
            break;
    }
};

connectToWhatsApp().catch((err) => console.log("unexpected error: " + err)); // catch any errors
server.listen(port, () => {
    console.log("Server Run Port : " + port);
});