## MODULES

- [Federated](https://github.com/senomas/micro-ql-federated)
- [Account](https://github.com/senomas/micro-ql-account)
- [Common](https://github.com/senomas/micro-ql-common)

## INITIAL
```
yarn --frozen-lockfile
```

## TEST
```
npx gulp test
```

## RUN
```
npx gulp run
```

## CREATE PROJECT

```
yarn init
yarn add typescript nodemon ts-node --dev
npx tsc --init --rootDir src --outDir dist --lib dom,es6 --module commonjs --removeComments
```

```
mkdir src
cd src
touch server.ts
```

```
yarn add consola
```
