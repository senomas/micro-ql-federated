import "mocha";
import { expect } from "chai";
import crypto from "crypto";
import { suite, test } from "mocha-typescript";

import { BaseTest, values } from "./base";

@suite
export class LoginTest extends BaseTest {

  @test
  public async serverInfo() {
    const res = await this.post(`{
      accountInfo {
        host
        time,
        buildTime
        commits {
          hash
          abbrevHash
          subject
          authorName
          authorDate
        }
      }
    }`);
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
  }

  @test
  public async testLogin() {
    const ecdh = crypto.createECDH(this.config.auth.curves);
    ecdh.generateKeys();
    values.ecdh = ecdh;

    let res = await this.post(`{
      auth(clientKey: "${ecdh.getPublicKey().toString("base64")}") {
        serverKey
      }
    }`);
    let val = res.body;
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
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
      aes.update(Buffer.from("admin", "utf8")),
      aes.final()
    ]).toString("base64");

    res = await this.post(`{
      auth(clientKey: "${ecdh.getPublicKey().toString("base64")}") {
        salt(xlogin: "${xlogin}")
      }
    }`);
    val = res.body;
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
    expect(val, res.log).to.haveOwnProperty("data");
    expect(val.data, res.log).to.haveOwnProperty("auth");
    expect(val.data.auth, res.log).to.haveOwnProperty("salt");
    const xsalt = val.data.auth.salt;

    const aesd = crypto.createDecipheriv("aes-256-ctr", aesKey, aesSalt);
    const salt = Buffer.concat([
      aesd.update(Buffer.from(xsalt, "base64")),
      aesd.final()
    ]).toString("utf8");

    const hpassword = crypto.pbkdf2Sync(
      "dodol123",
      Buffer.from(salt, "base64"),
      this.config.auth.pbkdf2.iterations,
      this.config.auth.pbkdf2.hashBytes,
      "sha512"
    );
    // console.log("HPASSWORD", hpassword.toString("base64"));

    aes = crypto.createCipheriv("aes-256-ctr", aesKey, aesSalt);
    const xhpassword = Buffer.concat([
      aes.update(hpassword),
      aes.final()
    ]).toString("base64");
    // console.log("XHPASSWORD", xhpassword);
    
    res = await this.post(`{
      auth(clientKey: "${ecdh.getPublicKey().toString("base64")}") {
        login(xlogin: "${xlogin}", xhpassword: "${xhpassword}") {
          seq token
        }
      }
    }`);
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
    values.token = res.body.data.auth.login.token;
  }

  @test
  public async testCurrent() {
    const res = await this.post(`{
      me {
        clientKey
        xlogin
        name
        privileges
        issuedAt
        expiredAt
        token {
          seq
          token
        }
      }
    }`);
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
    expect(res.body.data.me.token, res.log).to.eql(null);
  }

  @test
  public async testCurrentNoToken() {
    const res = await this.post(`{
      me {
        clientKey
        xlogin
        name
        privileges
        issuedAt
        expiredAt
        token {
          seq
          token
        }
      }
    }`, { token: null });
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
    expect(res.body.data.me.clientKey, res.log).to.eql(null);
    expect(res.body.data.me.privileges, res.log).to.eql([]);
  }

  @test
  public async testExpiredSessionToken() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const res = await this.post(`{
      me {
        clientKey
        xlogin
        name
        privileges
        issuedAt
        expiredAt
        token {
          seq
          token
        }
      }
    }`, {
      token:
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImF1dGgifQ.eyJjayI6IkJNK2F6WU9jWHg5czEzMUFtUGI1OWlqZ0lHRno0UDNQTnUyaTQ4NnU0b3lOcDd0dlhRZDJHN3dOeEFpaXVKZEsxRDRBeHBReDBDYnlKa05LeUM4cFBXbz0iLCJ4bCI6Ilp5OVFXQWc9IiwibiI6IkFkbWluIiwicCI6WyJ1c2VyLnJlYWQiLCJ1c2VyLnVwZGF0ZSIsInVzZXIuYWN0aXZhdGUiLCJ1c2VyLmRlYWN0aXZhdGUiLCJyb2xlLmNyZWF0ZSIsInJvbGUucmVhZCIsInJvbGUudXBkYXRlIiwicm9sZS5kZWxldGUiLCJtb3ZpZS5jcmVhdGUiLCJtb3ZpZS5yZWFkIiwibW92aWUudXBkYXRlIiwibW92aWUuZGVsZXRlIl0sImlhdCI6MTU3NTI3NjcxNywiZXhwIjoxNTc1Mjc2NzIyfQ.7wUYnnnkOx-UBheBQuFIQMK42M3YAOs48h_X3DUjPGjMYmeozQnHZ6c82n3aLlTqQHqNaSodiKIHSvTswEwM8A"
    });
    expect(res.status, res.log).to.eql(400);
    expect(res.body, res.log).to.haveOwnProperty("errors");
    expect(res.body.errors[0], res.log).to.haveOwnProperty("extensions");
    expect(res.body.errors[0].extensions.code, res.log).to.eql("SessionExpiredError");
  }

  @test
  public async testLogout() {
    await this.postLogout();
  }

  @test
  public async testRelogin() {
    await this.postLogin("admin", "dodol123");
  }

  // @test
  public async testReloginAfterTimeout() {
    await new Promise(resolve => setTimeout(resolve, 2100));
    await this.postLogin("admin", "dodol123");
  }

  @test
  public async testExpiredToken() {
    await this.postLogin("admin", "dodol123", 1);
    await new Promise(resolve => setTimeout(resolve, 1100));
    const res = await this.post(`{
      me {
        clientKey
        xlogin
        name
        privileges
        issuedAt
        expiredAt
        token {
          seq
          token
        }
      }
    }`);
    expect(res.status, res.log).to.eql(200);
    expect(res.body, res.log).to.not.haveOwnProperty("errors");
    expect(res.body.data.me.token, res.log).to.not.eql(null);
    expect(res.body.data.me.token.token, res.log).to.not.eql(null);
  }
}
