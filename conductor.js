#!/usr/bin/env node
const fs = require("fs");
const util = require("util");
const path = require("path");
const colors = require("colors");
const program = require("commander");
const server = require("./server");

const readFile = util.promisify(fs.readFile);

const handleError = error => {
  console.log(colors.red(error));
  process.exit(1);
};

program
  .version(require("./package.json").version)
  .usage("[options] <config file (defaults to ./conductor.json)>")
  .arguments("<config file>", "The config file, defaults to ./conductor.json")
  .option("-p, --port <port>", "The port to run the server on, if not set will be randomly selected.")
  .action(async configFile => {
    try {
      const port = program.port;
      const configString = await readFile(configFile || "./conductor.json", { encoding: "utf8" }).catch(handleError);
      const config = JSON.parse(configString);

      // start server:
      server(config, port);
    } catch (e) {
      return handleError(e);
    }
  });

program.parse(process.argv);
