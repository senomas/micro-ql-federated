const { dest, src } = require("gulp");
const shell = require("shelljs");
const args = require("yargs").argv;
const gitlog = require("gitlog");
const fs = require("fs");
const netstat = require('node-netstat');
const jwt = require("jsonwebtoken");

const project = "mmw";
const dockerComposePath = ".";

async function tsc() {
  await shell.exec("npx tsc -p tsconfig.build.json", {
    async: false
  });
}

async function build() {
  await shell.exec("yarn --frozen-lockfile", {
    async: false
  });
  await fix();
  await tsc();
  await copyData();
  const commits = gitlog({
    repo: ".",
    number: 10,
    fields: ["hash", "abbrevHash", "subject", "authorName", "authorDate"]
  });
  fs.writeFileSync(
    "dist/build.json",
    JSON.stringify({ buildTime: new Date(), commits })
  );
}

async function copyData() {
  await new Promise(resolve => {
    src("src/data/*.{json,yaml}")
      .pipe(dest("dist/data"))
      .on("end", resolve);
  });
}

async function dockerUp() {
  await shell.exec(`docker-compose -p ${project} up -d`, {
    cwd: dockerComposePath,
    async: false
  });
}

async function dockerDown() {
  await shell.exec(`docker-compose -p ${project} down`, {
    cwd: dockerComposePath,
    async: false
  });
}

async function kill() {
  await killPorts([5000])
}

async function run() {
  await dockerUp();
  await build();
  await shell.exec("node dist/server.js", {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "development",
      PORT: 5000
    },
    async: false
  });
}

async function killPorts(ports) {
  const res = {};
  await new Promise((resolve, reject) => {
    netstat({
      filter: {
        state: 'LISTEN'
      },
      done: (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      }
    }, data => {
      res[data.local.port] = data;
    })
  })
  for (port of ports) {
    if (res[port]) {
      console.log(`kill ${res[port].pid}`);
      await shell.exec(`kill ${res[port].pid}`, {
        async: false
      });
    }
  }
}

async function waitPorts(ports) {
  const expiry = Date.now() + 90000;
  while (true) {
    let res = [];
    await new Promise((resolve, reject) => {
      netstat({
        filter: {
          state: 'LISTEN'
        },
        done: (err) => {
          if (err) {
            return reject(err)
          }
          resolve()
        }
      }, data => {
        res.push(data);
      })
    })
    res = res.filter(data => ports.indexOf(data.local.port) >= 0);
    if (res.length === ports.length) {
      return
    }
    if (expiry < Date.now()) {
      throw `port not ready ${res.map(data => data.local.port)}`
    }
  }
}

async function fix() {
  await shell.exec("tslint --fix --project .", {
    async: false
  });
}

async function test() {
  await kill();
  await shell.exec("rm -rf log dist", {
    async: false
  });
  await run();
  console.log(
    `npx mocha -r ts-node/register ${
    args.bail ? "-b" : ""
    } --color -t 90000 test/**/*${args.mod ? `${args.mod}*` : ""}.spec.ts`
  );
  shell.exec(
    `npx mocha -r ts-node/register  ${
    args.bail ? "-b" : ""
    } --color -t 90000 test/**/*${args.mod ? `${args.mod}*` : ""}.spec.ts`,
    {
      env: {
        PATH: process.env.PATH,
        TEST_SERVER: `http://localhost:5000`
      },
      async: false
    }
  );
  await kill();
}

async function genkey() {
  const gen = await shell.exec("openssl ecparam -name secp256k1 -genkey -noout", {
    async: false,
    silent: true
  });
  const key = (await gen.exec("openssl ec -pubout", {
    async: false,
    silent: true
  })).stdout.split("\n").reduce((acc, v) => {
    let state = acc.state;
    const ln = acc.ln;
    if (state === 0) {
      if (v.startsWith("-----BEGIN PUBLIC KEY")) {
        ln.push(v);
        state = 1;
      }
    } else if (state === 1) {
      ln.push(v);
      if (v.startsWith("-----END PUBLIC KEY")) {
        state = 2;
      }
    }
    return { state, ln };
  }, { state: 0, ln: [] }).ln.join("\n");
  const pkey = gen.stdout.split("\n").reduce((acc, v) => {
    let state = acc.state;
    const ln = acc.ln;
    if (state === 0) {
      if (v.startsWith("-----BEGIN EC PRIVATE KEY")) {
        ln.push(v);
        state = 1;
      }
    } else if (state === 1) {
      ln.push(v);
      if (v.startsWith("-----END EC PRIVATE KEY")) {
        state = 2;
      }
    }
    return { state, ln };
  }, { state: 0, ln: [] }).ln.join("\n");
  console.log(`key: |\n${
    key.split("\n").map(v => `  ${v}`).join("\n")
    }\npkey: |\n${
    pkey.split("\n").map(v => `  ${v}`).join("\n")
    }`
  );
  const token = jwt.sign({
    n: "demo"
  }, pkey, {
    algorithm: "ES256",
  });
  console.log("TOKEN", token);
  const data = jwt.verify(token, key);
  console.log("TOKEN-DATA", JSON.stringify(data, undefined, 2));
}

module.exports = {
  fix,
  tsc,
  copyData,
  build,
  dockerUp,
  dockerDown,
  run,
  kill,
  test,
  genkey
};
