#!/usr/bin/env node
const fs = require("fs");
const util = require("util");
const path = require("path");
const colors = require("colors");
const program = require("commander");
const server = require("./server");

const readFile = util.promisify(fs.readFile);

const handleError = (error) => {
  console.log(colors.red(error));
  process.exit(1);
};

program
  .version(require("./package.json").version)
  .usage("[options] [config files...]")
  .arguments(
    "[configFiles...]",
    "The config file, defaults to ./conductor.json"
  )
  .option(
    "-p, --port <port>",
    "The port to run the server on, if not set will be randomly selected."
  )
  .option("-x, --no-browser", "Don't automatically open the browser.")
  .action(async (configFiles) => {
    try {
      const port = program.port;
      const browser = program.browser;

      let config = {};

      if (configFiles?.length === 0) {
        const configString = await readFile("./conductor.json", {
          encoding: "utf8",
        }).catch(handleError);
        config = JSON.parse(configString);
      } else {
        // use reduce to wait for one file to load before loading the next
        const promise = configFiles.reduce(
          async (previousPromise, configFile) => {
            await previousPromise;

            const configString = await readFile(configFile, {
              encoding: "utf8",
            }).catch(handleError);

            const fileConfig = JSON.parse(configString);
            Object.assign(config, fileConfig);

            return Promise.resolve();
          },
          Promise.resolve()
        );
        await promise;
      }

      server(config, port, browser);
    } catch (e) {
      return handleError(e);
    }
  });

program.parse(process.argv);
