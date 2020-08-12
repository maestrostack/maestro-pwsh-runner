const io = require('socket.io-client');
const feathers = require('@feathersjs/feathers');
const socketio = require('@feathersjs/socketio-client');
const auth = require('@feathersjs/authentication-client');
const { fork } = require('child_process');
const manager = require('./manager');


// const socket = io('http://localhost:3030');






// const socket = io('https://maestro.faas.chst.io');


const socket = io('http://maestro:3030');















//
//
//
//

const app = feathers();

app.configure(socketio(socket));

app.configure(auth({
  storageKey: 'auth'
}))

const taskQueue = app.service('request-task-queue');

taskQueue.on('created', task => {
  if(task.type == 'stack/provision/terraform') {

    // console.log(task)
    workTask(task)
  }
});

const getTaskBlock = async (id) => {
  const workflowBlock = await app.service('workflow-blocks').get(id);
  const block = await app.service('blocks').get(workflowBlock.parent_block);

  return block;
} 

// CLONE REPO
// const cloneBlockRepo = async block => {
//   const cloneResults = await manager.cloneRepo(block);
// }

const workTask = async (task) => {
  // get workflow block for this task
  const block = await getTaskBlock(task.workflow_block_id);
  // update activity so the UI updates
  app.service('request-activities').patch(task.activity_id, { state: 'clone-project', working: true, ui_state_icon: 'in-progress', ui_state_msg: 'Cloning project repo for activity.', ui_console_out: 'CLONING PROJECT SOURCE...' });
  // get activity for this task
  // getting after first update
  // so we can update the ui_console_out
  let activity = await app.service('request-activities').get(task.activity_id);

  block._activity = activity;



  if( !activity.project_cloned ) {
    // clone block repo
    const cloneResult = await manager.cloneRepo(block);
    app.service('request-activities').patch(task.activity_id, { state: 'project-cloned', working: true, ui_state_icon: 'in-progress', ui_state_msg: 'Project cloned', ui_console_out: activity.ui_console_out + '\nPROJECT SOURCE CLONED...', project_cloned: true });
    activity = await app.service('request-activities').get(task.activity_id);
  }


  app.service('request-activities').patch(task.activity_id, { state: 'start-terraform-init', working: true, ui_state_icon: 'in-progress', ui_state_msg: 'Executing terraform init',  ui_console_out: activity.ui_console_out + '\nRUN: terraform init\n' });
  activity = await app.service('request-activities').get(task.activity_id);

  // fork process to execute terraform init
  const initFork = fork('./manager/tfInit.js');
  initFork.send(block);
  initFork.on('message', async (outcome) => {

    // console.log(outcome);
    if(outcome.code == 0) {

      app.service('syslog').create({
        category: 'info',
        topic: 'stack/provision/terraform',
        message: `Success executing terraform init for activity ${task.activity_id} outcome: ${outcome.stdout}`,
        has_parent: true,
        parent_service_path: 'request-activities',
        parent_id: task.activity_id
      });
      await app.service('request-activities').patch(task.activity_id, {
        state: 'tf-init-success',
        tf_init_outcome: outcome.stdout,
        working: false,
        ui_state_msg: 'terraform init success', 
        ui_console_out: activity.ui_console_out + '\n' + outcome.stdout
      }).then( () => {
        executePlan();
      })
    }
    else {

      app.service('syslog').create({
        category: 'error',
        topic: 'stack/provision/terraform',
        message: `Error executing terraform init for activity ${task.activity_id} outcome: ${outcome.stderr}`,
        has_parent: true,
        parent_service_path: 'request-activities',
        parent_id: task.activity_id
      });


      await app.service('request-activities').patch(task.activity_id, {
        state: 'tf-init-error',
        tf_init_outcome: outcome.stderr,
        working: false,
        ui_state_error: true,
        ui_state_error_msg: outcome.stderr,
        ui_state_msg: 'ERROR terraform init', 
        ui_console_out: activity.ui_console_out + '\n' + outcome.stderr
      });
    }
    activity = await app.service('request-activities').get(task.activity_id);
    initFork.kill();
  });


  // function to execute terraform plan
  const executePlan = async () => {
    let activity = await app.service('request-activities').get(task.activity_id);
    // fork process to execute terraform init
    const forked = fork('./manager/tfPlan.js');
    forked.send(block);

    forked.on('message', async outcome => {
      // console.log(outcome);
      if(outcome.code == 0) {

        app.service('syslog').create({
          category: 'info',
          topic: 'stack/provision/terraform',
          message: `Success executing terraform plan for activity ${task.activity_id} outcome: ${outcome.stdout}`,
          has_parent: true,
          parent_service_path: 'request-activities',
          parent_id: task.activity_id
        });
        await app.service('request-activities').patch(task.activity_id, {
          state: 'tf-plan-success',
          tf_plan_outcome: outcome.stdout,
          working: false,
          ui_state_msg: 'SUCCESS terraform plan', 
          ui_console_out: activity.ui_console_out + '\n' + outcome.stdout
        }).then( () => {
          executeApply();
        })
      }
      else {

        app.service('syslog').create({
          category: 'error',
          topic: 'stack/provision/terraform',
          message: `Error executing terraform plan for activity ${task.activity_id} outcome: ${outcome.stderr}`,
          has_parent: true,
          parent_service_path: 'request-activities',
          parent_id: task.activity_id
        });


        await app.service('request-activities').patch(task.activity_id, {
          state: 'tf-plan-error',
          tf_init_outcome: outcome.stderr,
          working: false,
          ui_state_error: true,
          ui_state_error_msg: outcome.stderr,
          ui_state_icon: 'error',
          ui_state_msg: 'ERROR terraform plan', 
          ui_console_out: activity.ui_console_out + '\n' + outcome.stderr
        });
      }
      forked.kill();
    })
  }

  // execute terraform apply
  const executeApply = async () => {
    let activity = await app.service('request-activities').get(task.activity_id);
    // fork process to execute terraform init
    const forked = fork('./manager/tfApply.js');
    forked.send(block);

    forked.on('message', async outcome => {
      // console.log(outcome);
      if(outcome.code == 0) {

        app.service('syslog').create({
          category: 'info',
          topic: 'stack/provision/terraform/apply',
          message: `Success executing terraform apply for activity ${task.activity_id} outcome: ${outcome.stdout}`,
          has_parent: true,
          parent_service_path: 'request-activities',
          parent_id: task.activity_id
        });
        await app.service('request-activities').patch(task.activity_id, {
          state: 'tf-apply-success',
          tf_apply_outcome: outcome.stdout,
          working: false,
          ui_console_out: activity.ui_console_out + '\n' + outcome.stdout
        }).then( () => {
          allDone();
        })
      }
      else {

        app.service('syslog').create({
          category: 'error',
          topic: 'stack/provision/terraform/apply',
          message: `Error executing terraform apply for activity ${task.activity_id} outcome: ${outcome.stderr}`,
          has_parent: true,
          parent_service_path: 'request-activities',
          parent_id: task.activity_id
        });


        await app.service('request-activities').patch(task.activity_id, {
          state: 'tf-apply-error',
          tf_apply_outcome: outcome.stderr,
          working: false,
          ui_state_icon: 'error',
          ui_state_msg: 'ERROR terraform apply', 
          ui_state_error: true,
          ui_state_error_msg: outcome.stderr,
          ui_console_out: activity.ui_console_out + '\n' + outcome.stderr
        });
      }

      forked.kill();
    })
  }


  // alldone tasks
  const allDone = async () => {
    app.service('request-activities').patch(task.activity_id, {
      state: 'complete',
      ui_state_icon: 'complete',
      ui_state_msg: 'Complete',
      working: false
    });

    app.service('requests').patch(task.request_id, {
      next: true
    });
  }

}


app.authenticate({
  strategy: 'local',
  email: 'admin@system.local',
  password: 'P0pc0rn1'
})
.then( () => {
  // Use the messages service from the server
  console.log('\n\n\n====================\n| MAESTRO READY!   |\n====================')
})
.catch( e => {
  console.log(e);
})

