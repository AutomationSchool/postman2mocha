const dotenv = require('dotenv');
const path = require('path');

if (process.env.test_env) {
  dotenv.config({
    path: path.join('./env', process.env.test_env + '.env')
  });
}
