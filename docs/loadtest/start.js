const dynalite = require('dynalite');
const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
const port = Number(process.env.SIM_DDB_PORT || 4567);
server.listen(port, (err) => { if (err) throw err; console.log(`dynalite on ${port}`); });
