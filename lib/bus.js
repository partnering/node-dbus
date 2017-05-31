const debug             = require ('debug')('dbus-native:bus')
const util              = require ('util')
const utils             = require ('./utils')
const Errors            = require ('./Errors')
const inspect           = require ('util').inspect
const Promise           = require ('bluebird')
const constants         = require ('./constants')
const signature         = require ('./signature')
const DBusProxy         = require ('./DBusProxy')
const DBusService       = require ('./DBusService')
const EventEmitter      = require ('events').EventEmitter
const stdDbusIfaces     = require ('./stdifaces')
const parseSignature    = require ('./signature')
const DBusObjectLibs    = require ('./DBusObjectLibs')
const DBusInterfaceLibs = require ('./DBusInterfaceLibs')

const DBUS_MAX_NAME_LENGTH = utils.DBUS_MAX_NAME_LENGTH

const mandatory = utils.mandatory

const NotImplementedError = Errors.NotImplementedError
const ServiceUnknownError = Errors.ServiceUnknownError

const DBusInterface = DBusInterfaceLibs.DBusInterface

const STD_IFACES = ['org.freedesktop.DBus.Properties',
                    'org.freedesktop.DBus.Peer',
                    'org.freedesktop.DBus.Introspectable',
                    'org.freedesktop.DBus.ObjectManager']

/** @module Bus */

function bus(conn, opts) {
    if (!(this instanceof bus)) {
        return new bus(conn);
    }
    if(!opts) opts = {};

    var self = this;
    this.connection = conn;
    this.serial = 1;
    this.cookies = {}; // TODO: rename to methodReturnHandlers
    this.proxyCookies = {} // will contain serials of msgs for which we must translate return types to new API
    this.methodCallHandlers = {};
    this.signals = new EventEmitter();
    this.exportedObjects = {};

    // Will mark signal that have a listnenr with the new API
    this.newAPISignals = new Set()

    /**
     * Will store all DBusServices that are created and exposed on the bus.<br>
     * It is used to present introspection data.
     * @type {Map<DBusObject>}
    */
    this.exposedServices = new Map()

    // fast access to tree formed from object paths names
    // this.exportedObjectsTree = { root: null, children: {} };

    // Temporary function to make a low-level DBus call but with the new API for types (will replace 'invoke' later)
    this.invokeNewAPI = function(msg, callback) {
        msg.proxy = true
        self.invoke(msg, callback)
    }

    this.invoke = function(msg, callback) {
       if (!msg.type)
          msg.type = constants.messageType.methodCall;
          msg.serial = self.serial++

       self.cookies[msg.serial] = callback;
       if (msg.proxy === true) self.proxyCookies[msg.serial] = true
       self.connection.message(msg);
    };

    this.invokeDbus = function(msg, callback) {
        // debug(`invokeDBus():\n${inspect(msg)}`)
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

    this.sendError = function(msg = mandatory(), errorName = mandatory(), errorText) {
        /*
            Check that the error name respects the naming syntax, which is the same as interfaces, see
            https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-names-interface
        */
        if (!utils.isValidErrorName (errorName)) {
            throw new TypeError ('Error\'s name missing or invalid (see http://bit.ly/2cFC6Vx for naming rules).')
        }

        var reply = {
            type: constants.messageType.error,
            replySerial: msg.serial,
            destination: msg.sender,
            errorName: errorName,
            signature: 's',
            body: [ errorText ]
        };
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
       this.connection.message(reply)
    }

    // route reply/error
    this.connection.on('message', function(msg) {
       var msg = JSON.parse(JSON.stringify(msg))

       if (msg.type === constants.messageType.signal)
           debug(`Received signal:\n${inspect(msg)}`)

       // Check if the service uses the new API, if yes, deal with it
       if (self.exposedServices.has (msg.destination)) {
           debug(`Intercepting message because of new API`)
           return self.handleDBusMessage (msg)
       }

       var handler;
       if (msg.type == constants.messageType.methodReturn || msg.type == constants.messageType.error) {
           handler = self.cookies[msg.replySerial];
           if (msg.type == constants.messageType.methodReturn && msg.body) {
               msg.body.unshift(null); // first argument - no errors, null
           }
           if (handler) {
              delete self.cookies[msg.replySerial];
              var props = {
                 connection: self.connection,
                 bus: self,
                 message: msg,
                 signature: msg.signature
              };

              if (msg.type == constants.messageType.methodReturn) {
                  // If the method call was issued from a DBusProxy, convert the return values to new API
                  if (self.proxyCookies[msg.replySerial]) {
                    //   debug(`Return Message:\n${inspect(msg)}`)
                      let trees
                      let translatedTypes
                      if (msg.signature != null) {
                          trees = parseSignature (msg.signature)
                          // msg.body[0] contains 'null' because of the callback syntax
                          translatedTypes = msg.body.slice(1).map( (e, idx) => utils.fromOldToNewAPI (e, trees[idx]))
                      }

                      delete self.proxyCookies[msg.replySerial]

                      /*
                        We have to deal differently here if we have one or multiple return values.
                        If we have only one, then we must return an array whose first value is null (indicating no
                        error) and whose second value if the return value.
                        If we have several values, we must return an array whose first value is null (idem) and whose
                        second value is an array containing the values.
                        This is due to the fact that the call is promisified, so the callback here is the promise.
                        If one value is returned, the user can call .then(), if there are several values, either he can
                        call .then() and get an array, or he can call .spread() and get each individual value
                        separately.
                      */
                      if (translatedTypes === undefined ) {
                          handler.apply(props, [null, null])
                      }
                      else if (translatedTypes.length === 1)
                          handler.apply(props, [null, translatedTypes[0]])
                      else
                          handler.apply(props, [null, translatedTypes])
                  } else {
                      handler.apply(props, msg.body); // body as array of arguments
                  }
              }
              else
                 handler.call(props, msg.body);  // body as first argument
           }
       } else if (msg.type == constants.messageType.signal) {
           let mangledName = self.mangle(msg)
           debug ('Received Signal to re-emit (under ' + mangledName + ')')

            /*
                Dirty: check if there is a listener that listens on this signal with the new API, and re-emit under a
                different name (with the types translated in the new API)
            */
            if (self.newAPISignals.has(mangledName + 'NEWAPI')) {
                debug(`Re-emitting with translated types`)
                // Translate types from old to new API
                let trees = parseSignature (msg.signature)
                let translatedTypes = msg.body.map( (e, idx) => utils.fromOldToNewAPI (e, trees[idx]) )

                // Re-emit signal under a different name, with the translated types
                self.signals.emit(mangledName + 'NEWAPI', translatedTypes)
            }

           self.signals.emit(self.mangle(msg), msg.body, msg.signature);
       } else { // methodCall
        //    debug ('Message call received:\n', inspect (msg))
           if (stdDbusIfaces(msg, self))
               return;

           // exported interfaces handlers
           var obj, iface, impl;
           if (obj = self.exportedObjects[msg.path]) {

               if (iface = obj[msg['interface']]) {
                   // now we are ready to serve msg.member
                   impl = iface[1];
                   var func = impl[msg.member];
                   if (!func) {
                       // TODO: respond with standard dbus error
                       console.error('Method ' + msg.member + ' is not implemented ');
                       throw new Error('Method ' + msg.member + ' is not implemented ');
                   };
                   try {
                       result = func.apply(impl, msg.body);
                   } catch (e) {
                       console.error("Caught exception while trying to execute handler: ", e);
                       throw e;
                   }
                   // TODO safety check here
                   var resultSignature = iface[0].methods[msg.member][1];
                   var reply = {
                       type: constants.messageType.methodReturn,
                       destination: msg.sender,
                       replySerial: msg.serial
                   };
                   if (result) {
                       reply.signature = resultSignature;
                       reply.body = [result];
                   }
                   self.connection.message(reply);
                   return;
               } else {
                   console.error('Interface ' + msg['interface'] + ' is not supported');
                   // TODO: respond with standard dbus error
               }
           }
           // setMethodCall handlers
           handler = self.methodCallHandlers[self.mangle(msg)];
           if (handler) {
           var result;
           try {
               result = handler[0].apply(null, msg.body);
           } catch (e) {
               console.error("Caught exception while trying to execute handler: ", e);
               self.sendError(e.message, e.description);
               return;
           }
           var reply = {
               type: constants.messageType.methodReturn,
               destination: msg.sender,
               replySerial: msg.serial
               //, sender: self.name
           };
           if (result) {
               reply.signature = handler[1];
               reply.body = result;
           }
           self.connection.message(reply);
           } else {
               self.sendError(msg, 'org.freedesktop.DBus.Error.UnknownService', 'Uh oh oh(1)');
           }

       }
    });

    /**
     * Handle DBus message (new API)<br>
     * Takes care of dealing with method calls, method returns, signals call, properties, etc.
     */
    this.handleDBusMessage = function (msg = mandatory()) {
        // debug ('DBus Message:\n' + inspect (msg, {colors: true, depth: 6}))
        // Deal with messages from standard interfaces
        if (stdDbusIfaces(msg, self)) {
            // debug ('Standard interface dealt with.')
            return
        }

        // If this was not a message from a standard interface, let's fetch the correct service, object and interface
        let service
        let pathComponents = msg.path.split ('/')
        let abord = false // controls if we should stop traversing the objects
        let currObj // will be used to traverse the service and the objects
        let iface
        let traversedSoFar = '' // Will contain the currently traversed path to report error

        // First, we fetch the corresponding DBusService (and assign it to currObj to initiate traversing)
        service = currObj = self.exposedServices.get (msg.destination)

        // Sanity check that 'service' is not undefined
        if (typeof service === 'undefined')
            throw new Error ('internal error: service was not on exposed services Map.')

        // Then try to traverse the DBusService to reach the destination object
        if (msg.path === '/')
            pathComponents = ['/']
        else {
            pathComponents.shift() // get rid of the empty '' caused by the initial '/'
            pathComponents.unshift ('/') // add the '/' back, because there is always a root '/' object
        }

        while (!abord && pathComponents.length > 0) {
            let currPathComponent = pathComponents.shift()

            // Abord if the current object doesn't have an object at the specified path component
            if (! (currObj[currPathComponent] instanceof DBusObjectLibs.DBusObject)) {
                // Reply with a proper DBus error
                let str = `Path '${traversedSoFar}' is unknown on service '${msg.destination}'`
                self.sendError (msg, 'org.freedesktop.DBus.Error.UnknownObject', str)
                return
            }

            // Add the current path segment to the currently traveled path
            if (currPathComponent === '/')
                traversedSoFar = '/'
            else
                traversedSoFar += `${currPathComponent}/`

            // Traverse the object
            currObj = currObj[currPathComponent]
        }

        // At this point we have traversed the object, let's check if the target object has the requested interface
        if (! (currObj[msg.interface] instanceof DBusInterface)) {
            // Reply with a proper DBus error
            let str = `No such interface '${msg.interface}' on object at path '${msg.path}'`

            self.sendError (msg, 'org.freedesktop.DBus.Error.UnknownInterface', str)
            return
        }

        /*
        At this point, we have confirmed that the requested object path exists and it has the correct
        interface.
        Now we look at the type of message we are dealing with and proceed accordingly.
        */
        iface = currObj[msg.interface]

        // Deal with 'methodCall' messages
        if (msg.type == constants.messageType.methodCall) {
            let methodName = msg.member
            let methodCall

            /*
                Check if the interface possesses the function in its interface description
                and if there is a function with the correct name
            */
            if (!iface._ifaceDesc.methods.has (methodName) || typeof iface[methodName] !== 'function') {
                // Reply with a proper DBus error
                let str = `No such method '${methodName}'`

                self.sendError (msg, 'org.freedesktop.DBus.Error.UnknownMethod', str)
                return
            }

            // TODO: Do we need to check for params matching?

            /*
                Now we call the function.
                It's called with Promise.try which gives freedom to the user of the library:
                - for synchronous calls, the user can either return a normal value and Promise.try will turn it into a
                  fullfilled promise, which will be used in the .then() or return an already-fullfilled promise which
                  will be used in the .then() too.
                  In case of error, the user can throw Errors and they will be caught in the .catch()
                - for asynchronous calls, the user must return a promise
            */
            if (msg.body === undefined) {
                // If there are not arguments, explicitly call the function without any argument
                methodCall = Promise.try (() => iface[methodName] ())
            }
            else {
                /*
                    If there are arguments, it's a little tricky: we need to convert the old API-formatted types
                    in the new API-type format (so it's more convenient and intuitive to the user).
                    This is why we need to call `utils.fromOldToNewAPI()` before passing the arguments
                */
                // debug ('msg.signature: ' + msg.signature)
                // debug ('msg.body (must be translated to new API):\n' + inspect (msg.body, {depth: 5}))

                // Build the signature tree to assist in parsing
                let tree = signature (msg.signature)

                // debug ('Signature tree: ' + inspect (tree, {depth: 6}))

                // Convert each type from the old to the new API
                let t = msg.body.map ((e, idx) => utils.fromOldToNewAPI (e, tree[idx]))

                // debug (`\nTranslated types:\n${inspect (t, {depth: 5})}\n`)

                // Finally call the target method with the arguments in order
                methodCall = Promise.try (() => iface[methodName] (...t))
            }

            return methodCall
            .then( ret => {
                // If the call succeeded, we must translate it into the OLD API's structure so that marshalling is OK
                // debug ('ret: ' + inspect (ret, {colors: true, depth: 5}))

                let reply = {
                    type: constants.messageType.methodReturn,
                    destination: msg.sender,
                    replySerial: msg.serial,
                    signature: '',
                    body: [],
                }

                // If we have some return value from the function, build the 'reply.signature' and 'reply.body' field
                if (ret !== undefined) {
                    // Get the output
                    let output = iface._ifaceDesc.methods.get(methodName).output
                    let trees
                    let translatedTypes

                    // Convert the output into an array if it's not already
                    if (!Array.isArray (output))
                        output = [output]

                    // If we have only one return value, convert it and return it
                    if (output.length === 1) {
                        output = output[0]
                        /*
                            - Signature annotation elements should have only one key (the name of the argument), this
                              is why we take output[Object.keys(output)[0]] TODO: check if indeed there is only one key
                              and fail otherwise with 'Bad Formatted'
                        */
                        trees = signature (output[Object.keys(output)[0]])[0]
                        translatedTypes = utils.fromNewToOldAPI (ret, trees)
                        reply.signature = output[Object.keys(output)[0]]
                        reply.body = [translatedTypes]
                    }
                    // If we have several values, convert them all and return them
                    else {
                        /*
                            - Signature annotation elements should have only one key (the name of the argument), this
                              is why we take obj[Object.keys(obj)[0]] TODO: check if indeed there is only one key
                              and fail otherwise with 'Bad Formatted'
                            - Signature parsing function 'signature()' returns an array ; since we parsed only one,
                              we have to take the first element, this is why we have '[0]' after the call to signature()
                        */
                        trees = output.map (obj => signature (obj[Object.keys(obj)[0]])[0])
                        translatedTypes = ret.map ((val, idx) => utils.fromNewToOldAPI (val, trees[idx]))
                        reply.signature = output.reduce ((acc, obj) => acc + '' + obj[Object.keys(obj)[0]], '')
                        reply.body = translatedTypes
                    }
                    debug(`message to reply (1):\n${inspect(reply)}`)
                    self.connection.message (reply)
                    return

                } else {
                    debug(`message to reply (2):\n${inspect(reply)}`)
                    // If there is not return from the function, just reply without a body
                    self.connection.message (reply)
                }
            })
            .catch( (err) => {
                console.error ('Method call returned an error: ' + err)
                // If the call raised an error, send a proper DBus error
                self.sendError (msg, 'org.freedesktop.DBus.' + err.name, err.message)
            })

            return
        }
    }

    this.setMethodCallHandler = function(objectPath, iface, member, handler) {
        var key = self.mangle(objectPath, iface, member);
        self.methodCallHandlers[key] = handler;
    };

    this.exportInterface = function(obj = mandatory(), path = mandatory(), iface = mandatory()) {
        var entry;

        /*
            Check that the interface to expose does have a name (otherwise it makes 'undefined' interfaces)
            and that the name respects DBus specs:
            https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-names-interface
        */
        if (!utils.isValidIfaceName (iface.name)) {
            throw new TypeError ('Interface\'s name missing or invalid (see http://bit.ly/2cFC6Vx for naming rules).')
        }

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
        this.invokeDbus({ member: 'Hello' }, (err, name) => {
            if (err != null) {
                // If, for some reaosn, the 'Hello()' failed, emit our 'error' event to let the user know it failed
                this.emit('error', err)
                throw new Error(err)
            }

            self.name = name
            // Let the user know it's okay to begin
            this.emit('ready')
        })
    } else {
        self.name = null;
        // Let the user know it's okay to begin
        this.emit('ready')
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

    /**
     * Create a {DBusProxy} to represent a DBus service, on which to make method call, query or set properties and
     * listen for signals.
     * @param {string} serviceName Name of the remote DBus service for which we want to build a proxy
     * @param {number} [maxIntrospectionDepth=Infinity] Maximum depth at which we will carry the introspection
     */
    this.mkProxy = function (serviceName = mandatory(), maxIntrospectionDepth = Infinity) {
        // We can't use 'promisify' here, because it complains that 'this.invokeDBus' is not a function
        // console.log('\nbus.mkProxy() called\n\n')
        return new DBusProxy(serviceName, self)
/*
        return new Promise ((resolve, reject) => {
            self.listNames ((err, names) => {
                if (err) reject (err)
                else {
                    // Check if the service name we requested exists
                    // if (names.findIndex ( (name) => name === serviceName) !== -1) <- why bother?
                    if (names.includes (serviceName))
                        // If the service exists, create a DBusService to represent it and return it
                        resolve (new DBusProxy (serviceName, self))
                    else {
                        reject (new ServiceUnknownError (serviceName))
                    }
                }
            })
        })
//*/
    }

    /**
     * Expose a DBusService to the bus, making its DBus methods, properties and signals available to other DBus clients.
     * @param {DBusService} service The {@link DBusService} object that we will expose on the bus
     * @param {string} serviceName   The name under which we want to expose our service
     * @param {number} [flag=6]      Flags that controls if we want to steal the name, if we let others steal, it, etc. Look at the DBus documentation for more information.
     */
    this.exposeService = function (service = mandatory(), serviceName = mandatory(), flag = utils.DBUS_NAME_FLAG_REPLACE_EXISTING | utils.DBUS_NAME_FLAG_DO_NOT_QUEUE) {
        // Try to request the name, and if it succeeds, set service's name and bus
        return Promise.promisify (this.requestName) (serviceName, flag)
        .then( (retCode) => {
            // We return a success only if we are now the sole, primary owner of the name...
            if (retCode === utils.DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER) {
                let currObj = service['/']
                service.name = serviceName
                service.bus = self

                /*
                    Add this service to the list of exposed services
                    NOTE: we don't need to check if 'exposedServices' already has it because if it had, the return code
                    would be DBUS_REQUEST_NAME_REPLY_ALREADY_OWNER
                */
                this.exposedServices.set (serviceName, service)

                // debug ('Deal with object /')
                this.exposeObject (service, currObj)

                return
            }
            /*
                ...otherwise we reject the promise with the return code so that the user can decide what to do
            */
            else {
                let str = `Failed to request service name '${serviceName}': `

                if (retCode === utils.DBUS_REQUEST_NAME_REPLY_IN_QUEUE)
                    str += 'it is already owned by another process, and you are currently in the queue ; as soon as the process releases the name, the next process in the queue will get the name.'
                else if (retCode === utils.DBUS_REQUEST_NAME_REPLY_EXISTS)
                    str += 'it is already owned by another process, and either you did not try to steal the name or it did not let you steal it.'
                else
                    str += 'you already are the owner of this name!'

                throw new Error(str)
            }
        })
        .catch( (err) => {
            if (! (err instanceof Error)) {
                console.warn('And error was returned as a string, re-throwing it as a proper Error, but it should be fixed.')
                throw new Error(err)
            }

            // Otherwise, rethrow as-if
            throw err
	    // console.error(err.stack)
            // console.error ('Failed to expose service on bus: ' + err)
        })
    }
	/*
        - Traverse all the hierarchy of objects
           - Find the signals
           - listen to them
           - convert them into DBus signal and emit them on the bus (when they are emitted)
           - emit 'ExposedOnBus' signal to let interfaces know they are now on the bus
        */

    this.exposeObject = function (service, obj, path = '') {
    	const childrenPath = obj.getChildrenPaths()
    	let ifacesNames = obj.getIfaceNames()

        /*
            First deal with standard interfaces (this is because if a custom Interface gets treated before 'Properties')
            We can have a situation where a property is changed but since 'Properties' has not been dealt with before,
            we the 'PropertiesChanged' signal is not emitted.
        */
        const stdIfaces = ifacesNames.filter( name => STD_IFACES.includes(name) )
        const otherIfaces = ifacesNames.filter( name => !STD_IFACES.includes(name) )

    	obj.setService(service)

        // TODO: we should use promises here to ensure that all standard interfaces are finished before dealing with the other interfaces

    	// For all standard interfaces of this object...
    	for (let ifaceName of stdIfaces) {
    		this.exposeInterface(service, obj, ifaceName, path)
    	}

    	// For all interfaces of this object...
    	for (let ifaceName of otherIfaces) {
    		this.exposeInterface(service, obj, ifaceName, path)
    	}

    	// Then, recursively find and relay signals to this object's children
    	for (let childPath of childrenPath) {
    		debug(`Expose object path: ${path}/${childPath}`)
    		this.exposeObject (service, obj[childPath], path + '/' + childPath)
    	}
    }


    this.exposeInterface = function (service, obj, ifaceName, path) {
        debug(`Exposing interface '${ifaceName}' on path '${path}'`)

    	let signalsDef = obj[ifaceName]._ifaceDesc.signals
    	let propertiesDef = obj[ifaceName]._ifaceDesc.properties

        if (signalsDef === undefined)
            signalsDef = []

        if (propertiesDef === undefined)
            propertiesDef = []

    	//... then find all signals, listen to them and re-emit them in DBus form when they happen
    	for (let [signalName, signalType] of signalsDef) {
    		obj[ifaceName].on (signalName, (...args) => {
    			let output = Array.isArray (signalType.output) ? signalType.output : [signalType.output]
    			// Parse the signal's signature and convert it back to DBus-syntax
    			let signature = output.reduce( (acc, v) => acc + '' + v[Object.keys (v)[0]], '')
    			let trees
    			let translatedTypes
    			// Build signature trees from annotation
    			trees = output.map (obj => parseSignature (obj[Object.keys(obj)[0]])[0])
    			// Translate signal return values from new API to marshalling API
    			translatedTypes = args.map( (v, idx) => utils.fromNewToOldAPI (v, trees[idx]))

    			// Re-emit the signal on the DBus bus
    			self.sendSignal (path,
    				obj[ifaceName]._ifaceName,
    				signalName,
    				signature,
    				translatedTypes
    			)
    		})
    	}
    	// Define accessors for every properties
    	for (let [propName, propObj] of propertiesDef) {
    		// Save access mode
    		let propAccessMode = Object.keys(propObj)[0]
    		let propType = propObj[propAccessMode]
            debug(`${propName} has type ${propType} and access ${propAccessMode}`)

    		//get user-defined getter/setters
    		let propGetter = obj[ifaceName].__lookupGetter__(propName)
    		let propSetter = obj[ifaceName].__lookupSetter__(propName)

    		//use default getter/setter if not user-defined
    		if (propGetter == null) {
                debug(`${propName} will use default getter`)
    			propGetter = function() { return this['_' + propName] }
    		}
    		if (propSetter == null) {
                debug(`${propName} will use default setter`)
    			propSetter = function(newValue) { this['_' + propName] = newValue }
    		}

            let initialValue = obj[ifaceName][propName]

            if (typeof initialValue === 'object') {
                Object.defineProperty(obj[ifaceName], propName, {
                    get: propGetter,
                    set: function (newValue) {
                        let temp
                        let modifyiers = ['push', 'pop', 'shift', 'unshift', 'splice', 'copyWithin', 'fill', 'reverse', 'sort']
                        // First call the setter, to set the new value
                        propSetter.call(this, newValue)

                        // Then save this new value in a temporary variable (maybe modified / sanitized by the custom setter)
                        temp = this[`_${propName}`]

                        // Make a Proxy for the property
                        this[`_${propName}`] = new Proxy(temp, {
                			get: function (o, prop) {
                                // Intercept calls to functions that modify the property's contents without being 'setters'
                				if (modifyiers.includes(prop)) {
                					return (...args) => {
                                        // Execute the target function on the property, and save the result
                						let v = o[prop](...args)

                                        /*
                        				If the property is readable, emit 'PropertiesChanged' signal to propagate the
                        				change.
                        				NOTE: later, when this is implemented, we have to check for 'sync' or 'async'
                        				mode before emitting the signal
                        				*/
                        				if (propAccessMode !== 'write') {

                        					let changedProperties = {}
                        					let invalidatedProperties = []

                        					changedProperties[propName] = {
                        						type: propType,
                        						value: temp
                        					}

                        					debug (`Emitting 'PropertiesChanged' for '${propName}' because it's not write-only (and async mode was not disabled (because unsupported yet))`)

                        					obj['org.freedesktop.DBus.Properties'].emit ('PropertiesChanged',
                        						ifaceName,
                        						changedProperties,
                        						invalidatedProperties
                        					)
                        				}
                                        // Return the value that the target function would have returned
                						return v
                					}
                				}
                				else {
                					return o[prop]
                				}
                			}
                		})

                        let changedProperties = {}
                        let invalidatedProperties = []

                        changedProperties[propName] = {
                            type: propType,
                            value: temp
                        }

                        obj['org.freedesktop.DBus.Properties'].emit ('PropertiesChanged',
                            ifaceName,
                            changedProperties,
                            invalidatedProperties
                        )
                    }
                })

                // Call setter to initialize the value (and create a Proxy for it)
                obj[ifaceName][propName] = initialValue
            } else {
                // Copying property in "underscored" field
        		obj[ifaceName]['_' + propName] = initialValue

                // Define getters and setters
        		Object.defineProperty (obj[ifaceName], propName, {
        			get: propGetter,
        			set: function (newValue) {
                        debug(`Setting new value '${newValue}' for property '${propName}'`)
        				propSetter.call(this, newValue)
        				/*
        				If the property is readable, emit 'PropertiesChanged' signal to propagate the
        				change.
        				NOTE: later, when this is implemented, we have to check for 'sync' or 'async'
        				mode before emitting the signal
        				*/
        				if (propAccessMode !== 'write') {
        					let changedProperties = {}
        					let invalidatedProperties = []

        					changedProperties[propName] = {
        						type: propType,
        						value: newValue // TODO: use the actual value after call the setter (it might be changed)
        					}

        					debug (`Emitting 'PropertiesChanged' for '${propName}' because it's not write-only (and async mode was not disabled (because unsupported yet))`)

        					obj['org.freedesktop.DBus.Properties'].emit ('PropertiesChanged',
        						ifaceName,
        						changedProperties,
        						invalidatedProperties
        					)
        				}
        			}
        		})
            }
    	}

    	/*
    	Emit a signal to the interface indicating that it is now exposed on a bus and can begin
    	operations for which it needs to be exposed.
    	As DBusInterface are independent object, when they are created, they are not tied up to a
    	service nor an object, and are not exposed on a bus.
    	They can thus listen to this signal which tells them when they are now bound.
    	A reference to the service that exposed it is passed, so that methods in the interface can
    	access other service's methods (to prevent a DBus method call it itself) and so that methods
    	in the interface can use this service's connection to the bus (to make proxies, or other
    	DBus calls)
    	*/
    	obj[ifaceName].emit ('ExposedOnBus', service)
    }

    // TODO: refactor

    // bus meta functions
    this.addMatch = function(match, callback) {
        debug(`addMatch(${match})`)
        if(!self.name) {
            debug(`No name, returning`)
            return callback(null, null);
        }
        // this.invokeDbus({ 'member': 'AddMatch', signature: 's', body: [match] }, callback);
        self.invokeDbus({ 'member': 'AddMatch', signature: 's', body: [match] }, callback);
    };

    // Temporary function that registers a listener for a signal, with the new types API
    this.addMatchNewAPI = function(match, objectPath, ifaceName, signalName, callback) {
        let mangledName = self.mangle(objectPath, ifaceName, signalName) + 'NEWAPI'

        debug(`addMatchNewAPI, mangledName: ${mangledName}`)

        if(!self.name) {
            debug(`No name, returning`)
            return callback(null, null);
        }

        self.addMatch(match, callback)

        self.newAPISignals.add(mangledName)
    }

    this.removeMatchNewAPI = function (match, objectPath, ifaceName, signalName, callback) {
        let mangledName = self.mangle(objectPath, ifaceName, signalName) + 'NEWAPI'

        debug(`Removing match rule, mangledName: ${mangledName}`)

        if (self.name == null) return callback(null, null)

        self.newAPISignals.delete(mangledName)

        self.removeMatch(match, callback)
    }

    this.removeMatch = function( match, callback) {
        if (self.name == null) return callback(null, null)
        this.invokeDbus({ 'member': 'RemoveMatch', signature: 's', body: [match] }, callback)
    }

    this.getId = function(callback) {
        this.invokeDbus({ 'member': 'GetId' }, callback);
    };

    this.requestName = function(name, flags, callback) {
        self.invokeDbus({ 'member': 'RequestName', signature: 'su', body: [name, flags] }, function(err, name) {
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
        this.invokeDbus({ 'member': 'ListActivatableNames'}, callback);
    }

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
}

util.inherits(bus, EventEmitter)

module.exports = bus
