var m = new BobbleHead.Module('test');
m.manipulate = function(){
	return new Promise(function(resolve, reject) {
		var textnode = document.createTextNode("OK");
		document.appendChild(textnode);  
		resolve();
	}.bind(this));
};
bobblehead.registerModule(m);
var model = new BobbleHead.Model('testModel');
model.fetch = function(id){
	return new Promise(resolve => setTimeout(resolve, 1000));
};
model.search = function(properties){
	
};
model.get = function(id){
	return {result: 'Success'};
};
model.update = function(instance){
	
};
model.save = function(instance){
	
};
model.destroy = function(instance){
	
};
bobblehead.registerModel(model);