const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const spawn = require("cross-spawn");
var kill = require("tree-kill");
const Converter = require("ansi-to-html");
const mustacheExpress = require("mustache-express");
const mustache = require("mustache");
const { existsSync, readFileSync } = require("fs");

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
    15: "#CBCDD2",
  },
});

module.exports = function (configs, port = 0, openBrowser = true) {
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
      "Cache-Control": "no-cache",
    };
    res.writeHead(200, headers);

    res.write(`\n\nevent: clear\ndata: null\n\n`);

    const config = configs[name];
    const args = (config.args || []).map((arg) =>
      mustache.render(arg, {
        cwd: path.resolve(config.cwd),
      })
    );

    res.write(`event: command\ndata: ${[config.command].concat(args).join(" ")}\n\n`);
    res.write(`event: directory\ndata: ${path.resolve(config.cwd)}\n\n`);
    lines[name] && lines[name].forEach((l) => res.write(`event: line\ndata: ${l}\n\n`));

    const clientId = Date.now();
    const newClient = {
      id: clientId,
      res,
    };

    clients[name] = clients[name] || [];
    clients[name].push(newClient);

    req.on("close", () => {
      clients[name] = clients[name].filter((c) => c.id !== clientId);
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
      stopProcess(name);
    } else {
      write(name, "cannot stop.");
    }

    res.sendStatus(204);
  });

  app.get("/", (req, res) => {
    res.render("index.html", {
      links: Object.keys(configs).map((name) => ({ name })),
      port,
    });
  });

  const listener = app.listen(port, () =>
    console.log(`Running conductor on http://localhost:${listener.address().port}`)
  );
  port = listener.address().port;

  if (openBrowser) {
    try {
      if (process.platform == "darwin") {
        spawn("/usr/bin/open", [`http://localhost:${listener.address().port}`]);
      }

      if (process.platform == "win32") {
        const possibleChromeLocations = [
          "C:\\Program Files\\Google\\Chrome\\Application",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application",
          process.env.USERPROFILE + "\\AppData\\Local\\Google\\Chrome\\Application",
        ];
        const cwd = possibleChromeLocations.find((l) => existsSync(l));

        spawn("chrome.exe", [`--app=http://localhost:${listener.address().port}`], {
          cwd,
          detached: true,
        });
      }
    } catch {
      console.log("Unable to launch browser.");
    }
  }

  function write(name, line) {
    const jsonLine = JSON.stringify({ line });

    lines[name] = lines[name] || [];
    if (lines[name].length === 1000) {
      lines[name].shift();
    }
    lines[name].push(jsonLine);
    clients[name] &&
      clients[name].forEach((c) => {
        c.res.write(`event: line\ndata: ${jsonLine}\n\n`);
      });
  }

  function stopProcess(name, callback) {
    callback = callback || (() => {});

    if (processes[name]) {
      write(name, "stopping...");
      const p = processes[name];

      kill(p.pid, (error) => {
        if (error) {
          write(name, "an error occured while stopping.");
          callback(error);
        } else {
          processes[name] = null;
          write(name, "stopped.");
          callback();
        }
      });
    } else {
      callback();
    }
  }

  function startProcess(name) {
    stopProcess(name, (stopError) => {
      if (stopError) {
        // clear it anyway
        processes[name] = null;
      }

      write(name, "starting...");

      const config = configs[name];
      const env = Object.assign({}, process.env);

      if (config.envFile && existsSync(path.resolve(config.envFile))) {
        const fileContent = readFileSync(path.resolve(config.envFile));
        const varsFromFile = require("dotenv").parse(fileContent);
        Object.assign(env, varsFromFile);
      }

      if (config.env) {
        Object.assign(env, config.env);
      }

      const p = spawn(
        config.command,
        (config.args || []).map((arg) =>
          mustache.render(arg, {
            cwd: path.resolve(config.cwd),
          })
        ),
        { cwd: config.cwd, env }
      );

      p.stdout.on("data", (data) => {
        const line = ansiToHtml.toHtml(data.toString("utf8"));
        write(name, line);
      });

      p.stderr.on("data", (data) => {
        const line = ansiToHtml.toHtml(data.toString("utf8"));
        write(name, line);
      });

      p.on("error", (err) => {
        write(name, `Error: ${err}.`);
      });

      p.on("close", (code) => {
        write(name, `process closed all stdio with code ${code}`);
      });

      p.on("exit", (code) => {
        write(name, `process exited with code ${code}`);
      });

      processes[name] = p;
    });
  }

  Object.keys(configs).map((name) => {
    startProcess(name);
  });

  // keep the connections alive.
  setInterval(() => {
    Object.keys(clients).map((key) =>
      clients[key].forEach((c) => {
        c.res.write("event: ping\ndata: null\n\n");
        c.res.flush && c.res.flush();
      })
    );
  }, 60 * 1000);
};
