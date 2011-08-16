require.paths.unshift('./node_modules');

var http = require('http');
var amqp = require('amqp');
var URL = require('url');
var htmlEscape = require('sanitizer/sanitizer').escape;

function rabbitUrl() {
  if (process.env.VCAP_SERVICES) {
    conf = JSON.parse(process.env.VCAP_SERVICES);
    return conf['rabbitmq-2.4'][0].credentials.url;
  }
  else {
    return "amqp://localhost";
  }
}

var port = process.env.VCAP_APP_PORT || 3000;

var messages_in = [];
var messages_out = [];

var queue_lg = 'fs_m2m_lg_queue';
var queue_agl = 'fs_m2m_agl_queue';

function setup() {

  var exchange = conn.exchange('fs-m2mswitch-exchange', {durable: false}, function() {

    console.log("Exchange name is " + exchange.name);

    var queue_in = conn.queue(queue_lg +'_in', {durable: false, exclusive: true},
    function() {
      queue_in.bind(exchange.name, queue_lg + '_in');
    });

    var queue_out = conn.queue(queue_agl + '_out', {durable: false, exclusive: true},
    function() {
      queue_out.bind(exchange.name, queue_agl + '_out');
    });
    queue_in.on('queueBindOk', function() { httpServer(exchange); });
  });

  // test for Malcolm
  console.log("start -publishing message for malcolm onto: " + queue_agl + '_out');
  exchange.publish(queue_agl + '_out', {body: 'hello malcolm'});
  console.log("end - publishing message for malcolm onto: " + queue_agl + '_out');
}

function httpServer(exchange) {
  var serv = http.createServer(function(req, res) {
    var url = URL.parse(req.url);
    if (req.method == 'GET' && url.pathname == '/env') {
      printEnv(res);
    }
    else if (req.method == 'GET' && url.pathname == '/') {
      res.statusCode = 200;
      openHtml(res);
     // writeForm(res);
      writeMessages(res);
      closeHtml(res);
    }
    else if (req.method == 'POST' && url.pathname == '/') {
      console.log("in POST");
      chunks = '';
      req.on('data', function(chunk) { chunks += chunk; });
      console.log("in POST #2");
      req.on('end', function() {
        msg = unescapeFormData(chunks.split('=')[1]);
        console.log("Putting message on IN queue: " + msg);
        exchange.publish(queue_lg + '_in', {body: msg});

        new_msg = unescapeFormData(chunks.split('=')[1] + '_stans_check');
        console.log("Putting message on OUT queue: " + new_msg);
        exchange.publish(queue_agl + '_out', {body: new_msg});
        //exchange.publish(exchange.name, {body: msg});
        res.statusCode = 303;
        res.setHeader('Location', '/');
        res.end();
      });
    }
    else {
      res.statusCode = 404;
      res.end("This is not the page you were looking for.");
    }
  });
  serv.listen(port);
}

console.log("Starting ... AMQP URL: " + rabbitUrl());
var conn = amqp.createConnection({url: rabbitUrl()});
conn.on('ready', setup);

// connection to FMS outbound queue
var fms_conn = amqp.createConnection({url: 'amqp://lngtzljs:9O7Pyz5HSKg1lTMq@172.30.48.107:13849/jucdiwjo'});
conn.on('ready', function() {
   console.log("Connecting to FMS inbound queue... ");

   var fms_exchange = fms_conn.exchange('amq.fms-demo', {durable: false}, function() {
      console.log("FMS Exchange name is " + fms_exchange.name);
      var fms_queue_out = fms_conn.queue('fms-inbound', 
                                         {durable: false, exclusive: true},
                                         function() {
         fms_queue_out.subscribe(function(msg){
            console.log("START subscribe of FMS outbound queue");
            console.log("Message that i got is: " + msg.body);
            console.log("END subscribe of FMS outbound queue");
         });

         fms_queue_out.bind(fms_exchange.name, 'fms-inbound');
      });

      console.log("turning on subscribe to  FMS inbound queue... ");

      fms_queue_out.on('queueBindOk', function() { httpServer(fms_exchange); });
   });
   console.log("Finished with FMS inbound queue... ");
});


// ---- helpers

function openHtml(res) {
  res.write("<html><head><title>Node.JS / RabbitMQ demo</title></head><body>");
}

function closeHtml(res) {
  res.end("</body></html>");
}

function writeMessages(res) {
  res.write('<h1>Queues available in M2M Switch</h1>');
  res.write('<h2>' + queue_lg + '_in</h2>');
  res.write('<ol>');
  for (i in messages_in) {
    res.write('<li>' + messages_in[i] + '</li>');
  }
  res.write('</ol>');

  res.write('<h2>' + queue_agl + '_out</h2>');
  res.write('<ol>');
  for (i in messages_out) {
    res.write('<li>' + messages_out[i] + '</li>');
  }
  res.write('</ol>');
}

function writeForm(res) {
  res.write('<form method="post">');
  res.write('<input name="data"/><input type="submit"/>');
  res.write('</form>');
}

function printEnv(res) {
  res.statusCode = 200;
  openHtml(res);
  for (entry in process.env) {
    res.write(entry + "=" + process.env[entry] + "<br/>");
  }
  closeHtml(res);
}

function unescapeFormData(msg) {
  return unescape(msg.replace('+', ' '));
}


