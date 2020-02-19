# Backslash Build / Conductor

runs multiple parallel command line tasks and then opens a chrome app and streams the command outputs

## usage

```
$ conductor ./my-config.json
```

example config:

```
{
  "test-script": {
    "command": "node",
    "args": ["test.js"],
    "cwd": "./path/to/script"
  }
}
```
