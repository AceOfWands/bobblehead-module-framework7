import Framework7,{Dom7} from 'framework7';
import Sandbox from 'js-sandbox';
import Mustache from 'mustache';

(function(app){
	class Framework7Module extends BobbleHead.Module{
		constructor(app){
			super('framework7');
			this.imports = {
				'Framework7': Framework7,
				'Dom7': Dom7,
				'Mustache': Mustache
			}
			this.framework7 = null;
			this.root = null;
			this.app = app;
			this.re = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
		}
		init(configuration){
			super.init(configuration);
			var promises = null;
			if(configuration.properties.root &&
				configuration.properties.appid &&
				configuration.properties.appname){

				this.root = document.querySelector(configuration.properties.root);
				
				var routes = [];
				for(var _p in BobbleHead.PageFactory.pages){
					var p = BobbleHead.PageFactory.pages[_p];
					var pType = p.configuration.getProperty('type') || 'plain';
					routes.push({
						path: '/'+p.vid,
						templateUrl: (pType == 'template') ? p.path : undefined,
						componentUrl: (pType == 'component') ? p.path : undefined,
						async: (pType == 'plain') ? function(path, routeTo, routeFrom, resolve, reject){
							this.framework7.preloader.show();
							var xhttp = new XMLHttpRequest();
							xhttp.open("GET", path, true);
							xhttp.onreadystatechange = async function(route, onSuccess, onFailure){
								if(xhttp.readyState === XMLHttpRequest.DONE && xhttp.status === 404){
									this.framework7.preloader.hide();
									onFailure(new PageNotFoundException());
								}else if(xhttp.readyState === XMLHttpRequest.DONE){
									if(!route.context)
										route.context = {};
									var m;
									var scriptDivHTML = '';
									while ((m = this.re.exec(xhttp.response)) !== null) {
										scriptDivHTML += m[0];
									}
									var tks_queue = [];
									for(var tks of this.imports.Mustache.parse(xhttp.response))
										if(tks[0]!='text')
											tks_queue.push(tks);
									var wait_list = [];
									var actual_models = BobbleHead.ModelPool.getModels();
										while(tks_queue.length>0){
										var tks = tks_queue.shift();
										if(tks[4] instanceof Array)
											for(var _tks of tks[4])
												if(_tks[0]!='text' && _tks[0]!='name')
													tks_queue.push(_tks);
										if(tks[1].startsWith('models.')){
												var model = tks[1].split('.');
											if(!actual_models[model[1]])
												throw new BobbleHead.Exceptions.ModelNotFoundException(model[1]);
											try{
												var model_fetch = actual_models[model[1]].fetch(model[2]);
												if(model_fetch instanceof Promise)
														wait_list.push(model_fetch);
											}catch(e){
												throw new BobbleHead.Exceptions.FrameworkException('Invalid access to models by Mustache on page.');
											}
										}
									}
									route.context.models = actual_models;
									Promise.all(wait_list).then(async function(){
										onSuccess({
											content: this.imports.Mustache.render(xhttp.response, route.context)
										},
										{
											context: {
												models: actual_models,
												tempSource: scriptDivHTML
											}
										});
									}.bind(this));
								}
							}.bind(this, routeTo, resolve, reject);
							xhttp.send(null);
						}.bind(this, p.path) : undefined
					});
				}
				// Framework7 App main instance
				this.framework7  = new this.imports.Framework7({
					root: configuration.properties.root, // App root element
					id: configuration.properties.appid, // App bundle ID
					name: configuration.properties.appname, // App name
					theme: configuration.properties.theme || 'auto', // Automatic theme detection
					routes: routes,
					// Enable panel left visibility breakpoint
					panel: {
						leftBreakpoint: 960,
					},
				});
				// Dom7
				this.app.addToGlobalContext('$$',this.imports.Dom7);
				this.app.addToGlobalContext('framework7', this.framework7);
			}else
				throw new BobbleHead.Exceptions.GenericModuleException('root, appid or appname not setted in configuration for Framework7 module.');
		}
	};
	var module = new Framework7Module(app);
	window.Framework7Module_PageBuilder = class extends BobbleHead.PageBuilder{
		constructor(){
			super();
			this.pageStack = {};
		}
		buildPage(virtualID, data){
			return new Promise(function(resolve, reject) {
				var page = BobbleHead.PageFactory.getPage(virtualID);
				if(page){
					var toHistory = false;
					var ghosting = false;
					var view = module.framework7.views.current;
					var forceLock = false;
					var duplicate = false;
					if(!view)
						view = module.framework7.views[0];
					if(!view){
						view = module.framework7.views.create(document.getElementById(this.container).querySelector('.view'));
						forceLock = true;
					}
					if(!this.pageStack[view.id])
						this.pageStack[view.id] = [];
					if(this.currentPage && this.currentPage.page.ghostPage){
						this.currentPage = this.pageStack[view.id].pop() || null;
						ghosting = true;
					}
					if(!page.lock && this.currentPage!=null && (page.vid != this.currentPage.page.vid || page.allowDuplicate)){
						if(!ghosting && this.currentPage.page.keepLive)
							toHistory = true;
						this.pageStack[view.id].push(this.currentPage);
						if(page.vid == this.currentPage.page.vid)
							duplicate = true;
					}
					if(page.lock)
						this.pageStack[view.id] = [];
					var pageBuild_mainFunc = function(domcontainer){
						var pageContx = new BobbleHead.PageContext(domcontainer);
						this.currentPage = new BobbleHead.VirtualPage(page, data, pageContx, resolve, reject);
						this.checkVirtualPage(this.currentPage);
						this.buildPageByObject(page, data, pageContx, resolve, reject, {
							'clearPreviousHistory': page.lock || forceLock,
							'history': !ghosting,
							'reloadCurrent': duplicate
						}, view);
					}.bind(this);
					pageBuild_mainFunc(module.root);
				}else
					reject(new BobbleHead.Exceptions.PageNotFoundException());
			}.bind(this)).catch(function(e) {
				BobbleHead.Util.log(e);
			});
		}
		buildPageByObject(page, data, pageContext, onSuccess = BobbleHead.Util.defaultCallback, onFailure = BobbleHead.Util.defaultCallback, options = null, view){
			try{
				this.checkPage(page);
				var processPage = async function(data, configuration, sandbox, modulesToLoad, onSuccess, onFailure, pageData){
					var context = BobbleHead.Context.getGlobal();
					var appContainer = pageData.el;
					var observer = new MutationObserver(function(context, mutationsList){
						for(var mutation of mutationsList) {
							if (mutation.type == 'childList') {
								for(var x of mutation.addedNodes){
									this.setDefaultListener(context, x);
								}
							}
						}
					}.bind(this,context));
					observer.observe(appContainer, { subtree: true, childList: true });
					if((!configuration.getProperty('type') || configuration.getProperty('type') == 'plain')
							&& pageData.route.context && pageData.route.context.tempSource){
						var scriptContainer = document.createElement('div');
						appContainer.appendChild(scriptContainer);
						scriptContainer.innerHTML = pageData.route.context.tempSource;
						pageData.route.context.tempSource = null;
						var js = scriptContainer.getElementsByTagName("script");
						var lastscript = null;
						for(var i=0; i<js.length; i++){
							var nsync = js[i].getAttribute('async');
							if(js[i].getAttribute('src')!="" && js[i].getAttribute('src')!=null){
								var scriptfile = js[i].getAttribute('src');
								if(nsync != 'true' && lastscript != null)
								await lastscript;
								var scriptprom = new Promise(function(resolve, reject){
									var xhttp2 = new XMLHttpRequest();
									xhttp2.open('get', scriptfile, true);
									xhttp2.responseType = 'text';
									xhttp2.onreadystatechange = function(sandbox,sf){
										if(xhttp2.readyState === XMLHttpRequest.DONE){
											try{
												sandbox.execCode(xhttp2.response);
											}catch(e){
												BobbleHead.Util.log('Execution of scriptfile: '+sf, 3, e);
											}
											resolve();
										}
									}.bind(this,sandbox,scriptfile);
									xhttp2.send();
								}).catch(function(e) {
									BobbleHead.Util.log(e);
								});
								if(nsync != 'true')
								lastscript = scriptprom;
							}else{
								try{
									sandbox.execCode(js[i].innerHTML);
								}catch(e){
									BobbleHead.Util.log('Execution of script code', 3, e);
								}
							}
							
						}
					}
					this.setDefaultListener(context, appContainer);
					var navbar = document.querySelector('#'+this.container+'>.view>.navbar');
					if(navbar)
						this.setDefaultListener(context, navbar);
					var pageloadpromises = (lastscript == null) ? [] : [lastscript];
					for(var mod of BobbleHead.ModulePool.getModules()){
						if(modulesToLoad != null && modulesToLoad.indexOf(mod.name)>-1)
							for(var e of appContainer.querySelectorAll('[bbh-module*="'+mod.name+'"]')){
								e.setAttribute('bbh-manipulating','true');
								var sand = new Sandbox(e, context.clone());
								var modpromise = sand.execMethod('manipulate', [], mod);
								if(modpromise !== undefined)
									if(modpromise instanceof Promise)
										modpromise.then(function(){
											e.setAttribute('bbh-manipulating','false');
										});
									else
										throw new BobbleHead.Exceptions.FrameworkException(mod.name+' manipulate has not returned a promise');
									else
										e.setAttribute('bbh-manipulating','false');
								pageloadpromises.push(modpromise);
							}
					}
					Promise.all(pageloadpromises).then(function(){
						if((!configuration.getProperty('type') || configuration.getProperty('type') == 'plain'))
							module.framework7.preloader.hide();
						document.dispatchEvent(new BobbleHead.Events.PageReadyEvent());
						appContainer.dispatchEvent(new BobbleHead.Events.PageReadyEvent());
						onSuccess();
					});
				}.bind(this,data, page.configuration, pageContext, page.modules, onSuccess, onFailure);
				view.once('pageBeforeIn', processPage);
				if(data || page.configuration.properties){
					if(!options)
						options = {};
					if(!options.context)
						options.context = {};
					options.context.pageData = data;
					options.context.pageConf = page.configuration.properties;
				}
				
				view.router.navigate('/'+page.vid, options);
			}catch(e){
				onFailure(e);
				if(e instanceof RedirectException)
					if(e.vid == -1)
						this.pageBack();
					else
						this.buildPage(e.vid, e.data);
			}
		}
		pageBack(){
			var vpage = this.pageStack[module.framework7.views.current.id].pop();
			if(vpage){
				var duplicated = this.currentPage.page.vid === vpage.page.vid;
				this.currentPage = vpage;
				this.checkVirtualPage(vpage);
				if(duplicated){
					this.buildPageByObject(vpage.page, vpage.data, vpage.context, undefined, undefined, {
						'clearPreviousHistory': false,
						'history': false,
						'reloadCurrent': true
					}, module.framework7.views.current);
				}else
					module.framework7.views.current.router.back();
			}else
				throw new BobbleHead.Exceptions.PageNotFoundException();
		}
		setDefaultListener(context, container){
			super.setDefaultListener(context, container);
			if(container instanceof Element){
				if(container.tagName.toUpperCase() == 'A')
					var a = [container];
				else
					var a = container.getElementsByTagName("a");
				for(var i=0; i<a.length; i++){
					if(!a[i].hasAttribute('bbh-ignore') &&
						a[i].classList.contains('back')){
						a[i].onclick = function(pageBuilder){
							pageBuilder.pageBack();
							return false;
						}.bind(a[i],this);
						a[i].classList.remove('back');
					}
				}
			}
		}
	};
	app.registerModule(module);
})(bobblehead);