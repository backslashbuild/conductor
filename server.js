const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const spawn = require("cross-spawn");
const Converter = require("ansi-to-html");
var mustacheExpress = require("mustache-express");

const ansiToHtml = new Converter({
  fg: "#fafafc",
  bg: "#1c1d21",
  colors: {
    0: "#69666d",
    1: "#f44747",
    2: "#5DD8B7",
    3: "#E5CD52",
    4: "#79D9F1",
    5: "#b267e6",
    6: "#FF8A54",
    7: "#fafafc",
    8: "#1c1d21",
    9: "#EB3D54",
    10: "#1d6608",
    11: "#cd9731",
    12: "#4FB4D8",
    13: "#9b37e2",
    14: "#00DCDC",
    15: "#CBCDD2"
  }
});

module.exports = function(configs, port = 0) {
  const processes = {};
  const clients = {};
  const lines = {};

  const app = express();
  app.engine("html", mustacheExpress());
  app.set("view engine", "mustache");
  app.set("views", __dirname + "/views");
  app.use(cors());
  app.use(bodyParser.json());

  app.get("/events/:name", (req, res, next) => {
    const { name } = req.params;

    if (!configs[name]) {
      return res.sendStatus(400);
    }

    const headers = {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache"
    };
    res.writeHead(200, headers);

    res.write(`event: clear\n\n`);
    lines[name] && lines[name].forEach(l => res.write(`event: line\ndata: ${l}\n\n`));

    const clientId = Date.now();
    const newClient = {
      id: clientId,
      res
    };

    clients[name] = clients[name] || [];
    clients[name].push(newClient);

    req.on("close", () => {
      clients[name] = clients[name].filter(c => c.id !== clientId);
    });
  });

  app.get("/restart/:name", (req, res, next) => {
    const { name } = req.params;

    if (!configs[name]) {
      return res.sendStatus(400);
    }

    startProcess(name);

    res.sendStatus(204);
  });

  app.get("/stop/:name", (req, res, next) => {
    const { name } = req.params;

    if (!configs[name]) {
      return res.sendStatus(400);
    }

    if (processes[name]) {
      write(name, "stopping...");
      processes[name].kill("SIGINT");
      write(name, "stopped.");
      processes[name] = null;
    } else {
      write(name, "cannot stop.");
    }

    res.sendStatus(204);
  });

  app.get("/", (req, res) => {
    res.render("index.html", { links: Object.keys(configs).map(name => ({ name })), port });
  });

  const listener = app.listen(port, () => console.log(`Running command runner on ${listener.address().port}`));
  port = listener.address().port;
  spawn("chrome.exe", [`--app=http://localhost:${listener.address().port}`], { cwd: "C:\\Program Files (x86)\\Google\\Chrome\\Application", detached: true });

  function write(name, line) {
    const jsonLine = JSON.stringify({ line });

    lines[name] = lines[name] || [];
    lines[name].push(jsonLine);
    clients[name] &&
      clients[name].forEach(c => {
        c.res.write(`event: line\ndata: ${jsonLine}\n\n`);
      });
  }

  function startProcess(name) {
    if (processes[name]) {
      write(name, "stopping...");
      processes[name].kill();
      write(name, "stopped.");
    }

    write(name, "starting...");

    const config = configs[name];
    const p = spawn(config.command, config.args, { cwd: config.cwd });

    p.stdout.on("data", data => {
      const line = ansiToHtml.toHtml(data.toString("utf8"));
      write(name, line);
    });

    p.stderr.on("data", data => {
      const line = ansiToHtml.toHtml(data.toString("utf8"));
      write(name, line);
    });

    processes[name] = p;
  }

  Object.keys(configs).map(name => {
    startProcess(name);
  });
};
