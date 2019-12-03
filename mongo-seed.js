db = db.getSiblingDB('account');
db.createUser(
  {
    user: "admin",
    pwd: "dodol123",
    roles: [
      { role: "readWrite", db: "account" }
    ]
  }
)
