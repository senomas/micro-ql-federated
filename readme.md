## REQUIREMENTS
- node 12
- docker

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
