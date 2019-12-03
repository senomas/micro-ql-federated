import fs = require("fs");
import yaml = require("js-yaml");
import KeyEncoder from "key-encoder";

export const config = yaml.safeLoad(fs.readFileSync("config.yaml").toString());

export const keyEncoder = new KeyEncoder(config.auth.curves);
