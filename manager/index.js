const path = require('path');
const terraform = require('./terraformjs/src/index');
// const PWSH = require('node-powershell');


module.exports = {
  cloneRepo: async (block) => {
    const workingDirectory = path.join(__dirname, '../data/blocks');
    const git = require('simple-git')(workingDirectory);
    const localPath = workingDirectory + `/${block._activity._id}_${block._id}`;
    await git.clone(block.scm_url, localPath);

    return true;
  },
  pullRepo: async () => {

  },
  tfInit: async (block) => {

    const workingDirectory = path.join(__dirname, `../data/blocks/${block._activity._id}_${block._id}`);
    let tf = new terraform.Terraform(workingDirectory, true, true);
    // const tf = new Terrajs( { terraformDir: `${workingDirectory}` } );
    // const result = await tf.init();
    console.log(terraform.version());

    const outcome = await tf.init({}, workingDirectory);
    //console.log(outcome);
    return outcome;

  },
  tfPlan: async (block) => {

    const workingDirectory = path.join(__dirname, `../data/blocks/${block._activity._id}_${block._id}`);
    let tf = new terraform.Terraform(workingDirectory, false, false);
    // const tf = new Terrajs( { terraformDir: `${workingDirectory}` } );
    // const result = await tf.init();
    console.log(terraform.version());

    const outcome = await tf.plan({
      'var': block._activity.current_vars,
      'out': 'plan_out'
    });


    return outcome;



  },
  tfApply: async (block) => {

    const workingDirectory = path.join(__dirname, `../data/blocks/${block._activity._id}_${block._id}`);
    let tf = new terraform.Terraform(workingDirectory, true, true);
    // const tf = new Terrajs( { terraformDir: `${workingDirectory}` } );
    // const result = await tf.init();
    console.log(terraform.version());

    // const outcome = true;

    const outcome = await tf.apply({});


    return outcome;

  },
  tfDestroy: async (block) => {
    const workingDirectory = path.join(__dirname, `../data/blocks/${block._activity._id}_${block._id}`);
    let tf = new terraform.Terraform(workingDirectory, false, false);
    // const tf = new Terrajs( { terraformDir: `${workingDirectory}` } );
    // const result = await tf.init();
    console.log('\n\n===== STARTING DESTROY =====\n');
    console.log('TERRAFORM VERSION: ' + terraform.version());

    // const outcome = true;

    const outcome = await tf.destroy({
      var: block.current_vars
    });


    return outcome;
  }
  
};