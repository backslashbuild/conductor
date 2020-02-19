#!/usr/bin/env node
const fs = require("fs");
const util = require("util");
const path = require("path");
const colors = require("colors");
const program = require("commander");
const server = require("./server");

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const handleError = error => {
  console.log(colors.red(error));
  process.exit(1);
};

const showHelp = () => {
  program.outputHelp(colors.red);
  process.exit(1);
};

program
  .version(require("./package.json").version)
  .usage("[options] <config file>")
  .arguments("<config file>")
  .option("-p, --port <port>", "The port to run the server on, if not set will be randomly selected.")
  .action(async configFile => {
    try {
      const port = program.port;
      const configString = await readFile(configFile, { encoding: "utf8" }).catch(handleError);
      const config = JSON.parse(configString);

      // start server:
      server(config, port);
    } catch (e) {
      return handleError(e);
    }
  });

if (!process.argv.slice(2).length) {
  showHelp();
}

program.parse(process.argv);
