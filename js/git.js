const git_command = 'git describe --long --tags --always --dirty';

const exec = require('child_process').exec;

function get_git_status() {
  return new Promise( (resolve,reject) => {
    exec(git_command,(err,stdout) => {
      if (err) {
        reject(err);
      }
      resolve(String(stdout).trim());
    });
  });
};

module.exports = { get_git_status };