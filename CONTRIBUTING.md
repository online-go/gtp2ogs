Contributing is easy !

All the steps below need to use the ubuntu/linux terminal in some steps, 
but all the steps below are also possible on windows and mac

To contribute to gtp2ogs, you need to : 

### 1) fork online-go/gtp2ogs devel branch

go on the github [here](https://github.com/online-go/gtp2ogs/tree/devel) , 
click on "fork" on the top right

gtp2ogs will be forked to your github account and added to your 
respositories

### 2) clone your forked gtp2ogs devel branch

in a terminal, do :

```
git clone -b devel https://github.com/yourgithubusername/gtp2ogs/
```

you will see a warning message but dont mind it

A local copy of your gtp2ogs fork will be cloned/downloaded on your computer

### 3) (optional) update your fork if it is outdated

this step is needed only if you forked from online-go/gtp2ogs devel branch 
long ago : there are probably new commits available

The code below will : 

- add an entry to the "upstream" parent project source
- add a link of the parent upstream project in upstream/devel (your fork 
is in origin/devel)
- pull the github server latest "upstream" (online-go parent source) changes 
to your local branch (your fork)
- check which branch it is to make sure we didnt do a mistake (we are 
updating devel so it has to be devel)
- push your local changes to yourgithubusername github website and server 
(you updated your old fork devel with the latest devel "upstream" devel 
changes), username and password are asked for security, provide them and 
press ENTER to confirm

to update your fork to latest online-go commits, do :

```
git remote add upstream https://github.com/online-go/gtp2ogs && git fetch upstream && git pull upstream devel
git checkout devel && git push origin devel
```

if there are conflicts in the devel branch you can use instead (use with 
caution, previous commits on the devel branch will be erased)

```
git checkout devel && git push --force origin devel 
```

Note that this step will be needed everytime you want to add another 
contribution, if your forked devel is not in sync with the upstream 
(online-go) devel (not in sync = is a few commits behind the online-go 
devel)

### 4) Create a new branch to edit it

The devel branch should never be modified and always kept up to date with 
online-go devel

To keep your devel branch clean, your changes need to be made on a new 
branch which is a copy of the devel branch

To create a copy of the devel branch with a different name, do : 

```
git checkout -b yourbranchname && git branch
```

### 5) Edit your branch locally

Edit your branch locally as many times as you want (you can add files, 
remove files, edit and reedit, test your code, etc..)

To test your code, copy your edited gtp2ogs.js and paste overwrite 
the existing gtp2ogs.js in node_modules (you can make a backup of the 
existing one, and you can also make backups of your code improvements 
every while)

When your code is finalized and has been tested, it is time to commit it !

### 6) Commit your changes and push the commit(s) to your forked yourbranchname

The code below will now : 

- configure your github username and email (identity)
- detect all changes and all them on the "to be committed list"
- commit all the "to be commited" list, in one commit locally, 
write a commit 
name and save and exit (on ubuntu with nano you can save and exit with 
ctrl+x to exit then "y" to confirm)
- display which branch we are in again, to make sure we didnt commit 
in devel carelessly

```
git config user.name "yourgithubusername" && git config user.email "youremail@mail.com" && git add . && git commit -a && git branch
```

Now, time to push your local commit(s) to the github origin server

### 7) Push your local changes on the github origin server

Do : 

```
git push origin yourbranchname
```

it will ask your github username and password for security reasons, provide
 them then press ENTER.

Your branch is now visible on the github website

### 7B) If you want to cancel some of your latest commits/changes

If after testing/looking/discussing you want to go back to older commits, 
it is possible to remove one or many commits in your branch by doing this , 
while in your git branch 

```
git reset --hard <sha1_of_previous_commit>
```

You can find the sha1 commit in the commits list, for example here for 
online-go/gtp2ogs devel branch : 
[example of commits list](https://github.com/online-go/gtp2ogs/commits/devel)

[example of commit sha1 b60368b7376933e5a108c979473e5c9abe599711](https://github.com/online-go/gtp2ogs/commit/b60368b7376933e5a108c979473e5c9abe599711)

so in that example, to roll back to this commit, you would need to do for 
example :

```
git reset --hard b60368b7376933e5a108c979473e5c9abe599711
```

note : the "hard" reset will erase forever all commits later than this 
commit, use with caution !!

Then to export your local changes to the github server website page, 
force push your local changes : 

```
git branch
git push --force origin yourbranchname 
```

### 8) Create a pull request comparing yourgithubusername yourbranchname with onlinego devel

On the github website, click on "create pull request", and compare your 
branch to online-go devel branch

Write some title and description, then create the topic

Your changes will be reviewed by project maintainers, and hopefully 
if it's all good it will be merged in the devel branch

Pull requests can be seen [here](https://github.com/online-go/gtp2ogs/pulls)

This is an example of pull request, for example : 
[example of pull request](https://github.com/online-go/gtp2ogs/pull/81)

And thats it !

Hope this helps !

