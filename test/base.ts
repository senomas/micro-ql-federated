import "mocha";
import * as bunyan from "bunyan";
import { expect } from "chai";
import crypto from "crypto";
import chai = require("chai");
import chaiHttp = require("chai-http");
import fs = require("fs");
import yaml = require("js-yaml");

chai.use(chaiHttp);

export const values = {} as any;
export const config = yaml.safeLoad(fs.readFileSync("config.yaml").toString());

const ecdh = crypto.createECDH(this.config.auth.curves);
ecdh.generateKeys();

if (fs.existsSync("module.yaml")) {
  const gmods = yaml.safeLoad(fs.readFileSync("module.yaml").toString());
  Object.entries(gmods).forEach((v: any) => {
    if (v[1].subs) {
      this.config.modules[v[0]] = v[1].subs;
    }
  });
}

if (config.logger && config.logger.path) {
  const dir = process.env.LOGGER_PATH || config.logger.path || ".";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

export const logger = bunyan.createLogger(
  config.logger && config.logger.path
    ? {
      name: "test",
      streams: [
        {
          type: "rotating-file",
          ...config.logger,
          path: `${process.env.LOGGER_PATH ||
            config.logger.path ||
            "."}/test.log`
        }
      ]
    }
    : { name: "test" }
);

export class BaseTest {
  protected http = (chai as any).request(process.env.TEST_SERVER);
  protected config: any = config;

  public async postLogin(username, password, expiry = null) {
    values.ecdh = ecdh;

    let res = await this.post(`{
      auth(clientKey: "${ecdh.getPublicKey().toString("base64")}") {
        serverKey
      }
      account {
        errors {
          path
          name
          value
        }
      }
    }`);
    let val = res.body;
    expect(res.status, res.log).to.eql(200);
    expect(res.body.data.account.errors, res.log).to.eql(null);
    expect(val, res.log).to.haveOwnProperty("data");
    expect(val.data, res.log).to.haveOwnProperty("auth");
    expect(val.data.auth, res.log).to.haveOwnProperty("serverKey");
    const serverKey = val.data.auth.serverKey;

    const secretkey = ecdh.computeSecret(
      Buffer.from(serverKey, "base64")
    );
    const aesKey = crypto
      .pbkdf2Sync(
        secretkey,
        this.config.auth.salt,
        this.config.auth.aesKey.iterations,
        this.config.auth.aesKey.hashBytes,
        "sha512"
      );
    const aesSalt = crypto
      .pbkdf2Sync(
        ecdh.getPublicKey(),
        this.config.auth.salt,
        this.config.auth.aesSalt.iterations,
        this.config.auth.aesSalt.hashBytes,
        "sha512"
      );
    let aes = crypto.createCipheriv("aes-256-ctr", aesKey, aesSalt);
    const xlogin = Buffer.concat([
      aes.update(Buffer.from(username, "utf8")),
      aes.final()
    ]).toString("base64");

    res = await this.post(`{
      auth(clientKey: "${ecdh.getPublicKey().toString("base64")}") {
        salt(xlogin: "${xlogin}") {
          value
          errors {
            name
          }
        }
      }
    }`);
    val = res.body;
    expect(res.status, res.log).to.eql(200);
    expect(val, res.log).to.haveOwnProperty("data");
    expect(val.data, res.log).to.haveOwnProperty("auth");
    expect(val.data.auth.salt, res.log).to.not.eql(null);
    expect(val.data.auth.salt.value, res.log).to.not.eql(null);
    expect(val.data.auth.salt.errors, res.log).to.eql(null);
    const xsalt = val.data.auth.salt.value[0];

    const aesd = crypto.createDecipheriv("aes-256-ctr", aesKey, aesSalt);
    const salt = Buffer.concat([
      aesd.update(Buffer.from(xsalt, "base64")),
      aesd.final()
    ]).toString("utf8");

    const hpassword = crypto.pbkdf2Sync(
      password,
      Buffer.from(salt, "base64"),
      this.config.auth.pbkdf2.iterations,
      this.config.auth.pbkdf2.hashBytes,
      "sha512"
    );

    aes = crypto.createCipheriv("aes-256-ctr", aesKey, aesSalt);
    const xhpassword = Buffer.concat([
      aes.update(hpassword),
      aes.final()
    ]).toString("base64");

    res = await this.post(`{
      auth(clientKey: "${ecdh.getPublicKey().toString("base64")}") {
        login(salt: [], xlogin: "${xlogin}", xhpassword: "${xhpassword}"${expiry ? `, expiry: ${expiry}` : ""}) {
          seq
          token
          errors {
            path
            name
          }
        }
      }
    }`);
    expect(res.status, res.log).to.eql(200);
    expect(res.body.data.auth.login, res.log).to.not.eql(null);
    expect(res.body.data.auth.login.errors, res.log).to.eql(null);
    expect(res.body.data.auth.login.token, res.log).to.not.eql(null);
    values.seq = parseInt(res.body.data.auth.login.seq, 10);
    values.token = res.body.data.auth.login.token;
  }

  public async postLogout() {
    const res = await this.post(`
      mutation {
        logout {
          value
          errors {
            path
            name
          }
        }
      }`,
      { token: values.token }
    );
    expect(res.status, res.log).to.eql(200);
    expect(res.body.data.logout, res.log).to.not.eql(null);
    expect(res.body.data.logout.value, res.log).to.eql(true);
    expect(res.body.data.logout.errors, res.log).to.eql(null);
  }

  public async post(query: string, { token } = { token: values.token }) {
    const req = this.http.post("/graphql");
    if (token) {
      req.set("Authorization", `Bearer ${token}`);
    }
    const res = await req.send({
      query
    });
    logger.info({ res, body: res.body }, "post");
    res.log = `${res.request.method} ${res.request.url} ${JSON.stringify(
      res.body,
      undefined,
      2
    )}`;
    return res;
  }
}
