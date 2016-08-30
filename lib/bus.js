var EventEmitter = require('events').EventEmitter;
var constants    = require('./constants');
var stdDbusIfaces= require('./stdifaces');
var util = require ('util');
var Q = require ('q');
var promise = Q.defer().promise;

// Set to true to see debug logs (especially catching return types)
const DEBUG = false

module.exports = function bus(conn, opts) {
    if (!(this instanceof bus)) {
        return new bus(conn);
    }
    if(!opts) opts = {};

    var self = this;
    this.connection = conn;
    this.serial = 1;
    this.cookies = {}; // TODO: rename to methodReturnHandlers
    this.methodCallHandlers = {};
    this.signals = new EventEmitter();
    this.exportedObjects = {};

    // fast access to tree formed from object paths names
    // this.exportedObjectsTree = { root: null, children: {} };

    this.invoke = function(msg, callback) {
       if (!msg.type)
          msg.type = constants.messageType.methodCall;
       msg.serial = self.serial;
       self.serial++;
       this.cookies[msg.serial] = callback;
       self.connection.message(msg);
    };

    this.invokeDbus = function(msg, callback) {
       if (!msg.path)
           msg.path = '/org/freedesktop/DBus';
       if (!msg.destination)
           msg.destination = 'org.freedesktop.DBus';
       if (!msg['interface'])
           msg['interface'] = 'org.freedesktop.DBus';
       self.invoke(msg, callback);
    };

    this.mangle = function(path, iface, member) {
        var obj = {};
        if (typeof path === 'object') // handle one argumant case mangle(msg)
        {
            obj.path = path.path;
            obj['interface'] = path['interface'];
            obj.member = path.member;
        } else {
            obj.path = path;
            obj['interface'] = iface;
            obj.member = member;
        }
        return JSON.stringify(obj);
    };

    this.sendSignal = function(path, iface, name, signature, args) {
        var signalMsg = {
            type: constants.messageType.signal,
            serial: self.serial,
            'interface': iface,
            path: path,
            member: name
        };
        if (signature) {
            signalMsg.signature = signature;
            signalMsg.body = args;
        }
        self.connection.message(signalMsg);
    }

    this.sendError = function(msg, errorName, errorText) {
        var reply = {
            type: constants.messageType.error,
            replySerial: msg.serial,
            destination: msg.sender,
            errorName: errorName,
            signature: 's',
            body: [ errorText ]
        };
        //console.log('SEND ERROR', reply);
        this.connection.message(reply);
    }

    this.sendReply = function(msg, signature, body)
    {
       var reply = {
            type: constants.messageType.methodReturn,
            replySerial: msg.serial,
            destination: msg.sender,
            signature: signature,
            body: body
        };
       this.connection.message(msg);
    }

    // route reply/error
    this.connection.on('message', function(msg) {
       var msg = JSON.parse(JSON.stringify(msg));
       var handler;
       if (msg.type == constants.messageType.methodReturn || msg.type == constants.messageType.error) {
           handler = self.cookies[msg.replySerial];
           if (msg.type == constants.messageType.methodReturn && msg.body)
              msg.body.unshift(null); // first argument - no errors, null
           if (handler) {
              delete self.cookies[msg.replySerial];
              var props = {
                 connection: self.connection,
                 bus: self,
                 message: msg,
                 signature: msg.signature
              };
              if (msg.type == constants.messageType.methodReturn)
                 handler.apply(props, msg.body); // body as array of arguments
              else
                 handler.call(props, msg.body);  // body as first argument
           }
       } else if (msg.type == constants.messageType.signal) {
           self.signals.emit(self.mangle(msg), msg.body, msg.signature);
       } else { // methodCall

           if (stdDbusIfaces(msg, self))
               return;

           // exported interfaces handlers
           var obj, iface, impl;
           if (obj = self.exportedObjects[msg.path]) {
            //    console.log ('msg:');
            //    console.log (msg)
            //    console.log ('exportedObjects:');
            //    console.log (self.exportedObjects);
            //    console.log ('obj:');
            //    console.log (obj);

               if (iface = obj[msg['interface']]) {
                   // iface[0] contains the interface description
                //    console.log ('iface:');
                //    console.log (iface);
                //    console.log ('\niface[0]:\n');
                //    console.log (iface[0]);
                //    console.log ('\niface[1]:\n');
                //    console.log (iface[1]);
                   // iface[1] contains the implementation of the interface (functions, signals, properties)
                   impl = iface[1];
                   // now we are ready to serve msg.member
                   // The function can either be in the iface implementation or set manually in the methodCallHandlers
                   var func = impl[msg.member] || self.methodCallHandlers[self.mangle(msg)];

                   if (!func) {
                    //    console.log ('>>> Lacks function');
                    //    var m = self.mangle(msg);
                    //    console.log ('>m:\n');
                    //    console.log (m);
                    //    console.log ('methodCallHandlers:\n');
                    //    console.log (self.methodCallHandlers);
                    //    console.log ('\n');
                       // TODO: respond with standard dbus error
                       console.error('Method ' + msg.member + ' is not implemented ');
                       throw new Error('Method ' + msg.member + ' is not implemented ');
                   };
                //    console.log ('\nfunc:\n');
                //    console.log (func);
                //    console.log ('\nfunc.type: ' + typeof func);
                   try {
                    //    console.log ('\nmsg.body:\n');
                    //    console.log (msg.body);
                       result = func.apply(impl, msg.body);
                    //    console.log ('\nresult:\n');
                    //    console.log (result);
                   } catch (e) {
                       console.error("Caught exception while trying to execute handler: ", e);
                       throw e;
                   }

                   // TODO safety check here
                   // Check if 'methods' were added by the user to the interface description
                   if (iface[0].methods) {
                       var resultSignature = iface[0].methods[msg.member][1];
                    //    console.log ('resultSignature:\n');
                    //    console.log (resultSignature);
                       var reply = {
                           type: constants.messageType.methodReturn,
                           destination: msg.sender,
                           replySerial: msg.serial
                       };
                       if (result) {
                           reply.signature = resultSignature;

                        //    reply.body = [result];
                            // If the result is a promise, resolve and return answer
                            if (result.then) {
                                if (DEBUG)
                                    console.log ("Return type is promise");
                                // reply.conn = self.connection;
                                // result.then (_messageResult.bind (reply));
                                result.then ( (res) => {
                                    if (DEBUG) {
                                        console.log (`Promise's result from remote: ${util.inspect (res)}`)
                                    }

                                    /* Automatically wrapping 'result' in bracket results in signature mismatch if:
                                        - the user already wrapped the return value (like 'return [5]')
                                        - the functions needs to return several values (like 'return [1,5,6]')
                                       So the idea is to check if 'result' is already an array and if not, wrap it.
                                     */
                                    reply.body = Array.isArray (res) ? res : [res]
                                    if (DEBUG) {
                                        console.log (`About to send this message: ${util.inspect (reply)}`)
                                    }
                                    self.connection.message (reply);
                                    if (DEBUG)
                                        console.log ("Message sent");
                                })
                                .catch (function (err) {
                                    // TODO: return DBus error instead of throwing an error that is uncaught
                                    throw new Error (err)
                                })
                                .done()
                            } else {
                                // If the result is not a promise but synchronous result, return it as the answer
                                if (DEBUG)
                                    console.log ('Return type is plain')
                                /* Automatically wrapping 'result' in bracket results in signature mismatch if:
                                    - the user already wrapped the return value (like 'return [5]')
                                    - the functions needs to return several values (like 'return [1,5,6]')
                                   So the idea is to check if 'result' is already an array and if not, wrap it.
                                 */
                                reply.body = Array.isArray (result) ? result : [result];
                                self.connection.message (reply);
                            }
                       }
                    //    self.connection.message(reply);

                       return
                   } else {
                       // Means the user did not define 'methods' in his interface
                       console.error ('No \'methods\' defined in interface description.');
                       throw new Error ("No 'methods' defined in interface description.");
                   }
               } else {
                   console.error('Interface ' + msg['interface'] + ' is not supported');
                   // TODO: respond with standard dbus error
               }
           }
           // setMethodCall handlers
        //    handler = self.methodCallHandlers[self.mangle(msg)];
        //    if (handler) {
        //    var result;
        //    try {
        //        result = handler[0].apply(null, msg.body);
        //    } catch (e) {
        //        console.error("Caught exception while trying to execute handler: ", e);
        //        self.sendError(e.message, e.description);
        //        return;
        //    }
        //    var reply = {
        //        type: constants.messageType.methodReturn,
        //        destination: msg.sender,
        //        replySerial: msg.serial
        //        //, sender: self.name
        //    };
        //    if (result) {
        //        reply.signature = handler[1];
        //        reply.body = result;
        //    }
           self.connection.message(reply);
        //    } else {
        //        self.sendError(msg, 'org.freedesktop.DBus.Error.UnknownService', 'Uh oh oh');
        //    }

       }
    });

    this.setMethodCallHandler = function(objectPath, iface, member, handler) {
        var key = self.mangle(objectPath, iface, member);
        // console.log ('[setMethodCallHandler] methodCallHandlers (before):\n');
        // console.log (self.methodCallHandlers);
        self.methodCallHandlers[key] = handler;
        // console.log ('[setMethodCallHandler] methodCallHandlers (after):\n');
        // console.log (self.methodCallHandlers);
    };

    this.exportInterface = function(obj, path, iface) {
        var entry;
        if (!self.exportedObjects[path])
            entry = self.exportedObjects[path] = {};
        else
            entry = self.exportedObjects[path];
        entry[iface.name] = [iface, obj];
        // monkey-patch obj.emit()
        if (typeof obj.emit === 'function' ) {
            var oldEmit = obj.emit;
            obj.emit = function() {
                var args = Array.prototype.slice.apply(arguments);
                var signalName = args[0];
                if (!signalName)
                    throw new Error('Trying to emit undefined signa');

                //send signal to bus
                var signal;
                if (iface.signals && iface.signals[signalName])
                {
                    signal = iface.signals[signalName];
                    //console.log(iface.signals, iface.signals[signalName]);
                    var signalMsg = {
                        type: constants.messageType.signal,
                        serial: self.serial,
                        'interface': iface.name,
                        path: path,
                        member: signalName
                    };
                    if (signal[0]) {
                        signalMsg.signature = signal[0];
                        signalMsg.body = args.slice(1);
                    }
                    self.connection.message(signalMsg);
                    self.serial++;
                }
                // note that local emit is likely to be called before signal arrives
                // to remote subscriber
                oldEmit.apply(obj, args);
            };
        }
        // TODO: emit ObjectManager's InterfaceAdded
    };

    // register name
    if(opts.direct !== true) {
        this.invokeDbus({ member: 'Hello' }, function(err, name) {
            if (err) throw new Error(err);
            self.name = name;
        });
    } else {
        self.name = null;
    }

    function DBusObject(name, service) {
        this.name = name;
        this.service = service;
        this.as = function(name) {
            return this.proxy[name];
        };
    }

    function DBusService(name, bus) {
        this.name = name;
        this.bus = bus;
        this.getObject = function(name, callback) {
            var obj = new DBusObject(name, this);
            //console.log(obj);
            var introspect = require('./introspect.js');
            introspect(obj, function(err, ifaces, nodes) {
                if (err) return callback(err);
                obj.proxy = ifaces;
                obj.nodes = nodes;
                callback(null, obj);
            });
        };

        this.getInterface = function(objName, ifaceName, callback) {
            this.getObject(objName, function(err, obj) {
                if (err) return callback(err);
                callback(null, obj.as(ifaceName));
            });
        };
    }

    this.getService = function(name) {
        return new DBusService(name, this);
    };

    this.getObject = function(path, name, callback) {
       var service = this.getService(path);
       return service.getObject(name, callback);
    };

    this.getInterface = function(path, objname, name, callback) {
       return this.getObject(path, objname, function(err, obj) {
           if (err) return callback(err);
           callback(null, obj.as(name));
       });
    };

    // TODO: refactor

    // bus meta functions
    this.addMatch = function(match, callback) {
        if(!self.name) return callback(null, null);
        this.invokeDbus({ 'member': 'AddMatch', signature: 's', body: [match] }, callback);
    };

    this.removeMatch = function(match, callback) {
        if(!self.name) return callback(null, null);
        this.invokeDbus({ 'member': 'RemoveMatch', signature: 's', body: [match] }, callback);
    };

    this.getId = function(callback) {
        this.invokeDbus({ 'member': 'GetId' }, callback);
    };

    this.requestName = function(name, flags, callback) {
        this.invokeDbus({ 'member': 'RequestName', signature: 'su', body: [name, flags] }, function(err, name) {
            //self.name = name;
            if (callback)
                callback(err, name);
        });
    };

    this.releaseName = function(name, callback) {
        this.invokeDbus({ 'member': 'ReleaseName', signature: 's', body: [name] }, callback);
    };

    this.listNames = function(callback) {
       this.invokeDbus({ 'member': 'ListNames' }, callback);
    };

    this.listActivatableNames = function(callback) {
       this.invokeDbus({ 'member': 'ListActivatableNames', signature: 's', body: [name]}, callback);
    };

    this.updateActivationEnvironment = function(env, callback) {
       this.invokeDbus({ 'member': 'UpdateActivationEnvironment', signature: 'a{ss}', body: [env]}, callback);
    };

    this.startServiceByName = function(name, flags, callback) {
       this.invokeDbus({ 'member': 'StartServiceByName', signature: 'su', body: [name, flags] }, callback);
    };

    this.getConnectionUnixUser = function(name, callback) {
       this.invokeDbus({ 'member': 'GetConnectionUnixUser', signature: 's', body: [name]}, callback);
    };

    this.getConnectionUnixProcessId = function(name, callback) {
       this.invokeDbus({ 'member': 'GetConnectionUnixProcessID', signature: 's', body: [name]}, callback);
    };

    this.getNameOwner = function(name, callback) {
       this.invokeDbus({ 'member': 'GetNameOwner', signature: 's', body: [name]}, callback);
    };

    this.nameHasOwner = function(name, callback) {
       this.invokeDbus({ 'member': 'NameHasOwner', signature: 's', body: [name]}, callback);
    };
};
